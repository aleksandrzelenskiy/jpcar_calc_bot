import { RateCache } from "./models";

export type SupportedCurrency = "JPY" | "USD" | "EUR" | "RUB";

export interface CurrencyRates {
  [code: string]: number; // RUB за 1 (USD/EUR/RUB) или за 100 (JPY)
}

const ATB_URL = "https://www.atb.su/services/exchange/";

/**
 * Основной вход: получаем курсы с кешированием по дате.
 */
export async function getRates(): Promise<CurrencyRates> {
  const today = new Date().toISOString().slice(0, 10);

  const cached = await RateCache.findOne({ date: today });
  if (cached) {
    const rates = mapToObject(cached.rates);
    if (hasAll(rates)) return rates;
  }

  const response = await fetch(ATB_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch rates: ${response.statusText}`);
  }

  const html = await response.text();

  let rates: CurrencyRates;
  try {
    rates = parseAtbRates(html);
  } catch (err) {
    if (cached) {
      console.error("Falling back to cached rates due to parse error", err);
      return mapToObject(cached.rates);
    }
    throw err;
  }

  await RateCache.findOneAndUpdate(
      { date: today },
      { rates },
      { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return rates;
}

/**
 * Конвертация в рубли.
 *
 * ВАЖНО: JPY в rates хранится "за 100¥".
 */
export function convertToRub(
    amount: number,
    currency: SupportedCurrency,
    rates: CurrencyRates
): number {
  const rate = rates[currency];
  if (!rate) throw new Error(`Unsupported currency ${currency}`);

  if (currency === "JPY") {
    // rate = RUB за 100¥
    return (amount / 100) * rate;
  }

  // USD/EUR/RUB — курс за 1 единицу
  return amount * rate;
}

/**
 * Mongoose Map -> plain object.
 */
function mapToObject(map: any): CurrencyRates {
  if (!map) return {} as CurrencyRates;
  const entries: [string, number][] = [];

  if (map && typeof map.entries === "function") {
    for (const [key, value] of map.entries()) {
      entries.push([key, Number(value)]);
    }
  } else {
    for (const [key, value] of Object.entries(map ?? {})) {
      entries.push([key, Number(value)]);
    }
  }

  return Object.fromEntries(entries) as CurrencyRates;
}

function hasAll(rates: CurrencyRates): boolean {
  return !!(rates.JPY && rates.USD && rates.EUR && rates.RUB);
}

/**
 * Парсим вкладку "для денежных переводов" — это currencyTab4 с таблицей.
 * JPY сохраняем КАК НА САЙТЕ: RUB за 100¥ (без деления на 100).
 */
function parseAtbRates(html: string): CurrencyRates {
  const transferBlock = sliceTab(html, "currencyTab4");

  const usdSale = parseSaleFromBlock(transferBlock, "USD");
  const eurSale = parseSaleFromBlock(transferBlock, "EUR");
  const jpySalePer100 = parseSaleFromBlock(transferBlock, "JPY");

  if (usdSale && eurSale && jpySalePer100) {
    return {
      RUB: 1,
      USD: usdSale,        // "за 1$"
      EUR: eurSale,        // "за 1€"
      JPY: jpySalePer100,  // "за 100¥" ← как в вёрстке
    };
  }

  // Фолбэк: скрытые инпуты
  const hidden = parseHiddenInputs(html);
  if (hidden) return hidden;

  throw new Error("ATB transfer rates not found or malformed");
}

/**
 * Вырезает HTML блока нужного таба.
 * На странице два currencyTab4, поэтому:
 * - проходим по всем вхождениям id="currencyTab4"
 * - выбираем то, внутри которого есть "currency-table".
 */
function sliceTab(html: string, id: string): string {
  const marker = `id="${id}"`;
  let pos = html.indexOf(marker);
  if (pos === -1) return html;

  let chosenStart = -1;

  while (pos !== -1) {
    const next = html.indexOf(marker, pos + marker.length);
    const end = next === -1 ? html.length : next;
    const chunk = html.slice(pos, end);

    if (chunk.includes("currency-table")) {
      // Это таб с таблицей, запоминаем его как кандидата
      chosenStart = pos;
    }

    pos = next;
  }

  // Если нашли таб с таблицей — берём его, иначе первый попавшийся
  const start =
      chosenStart !== -1 ? chosenStart : html.indexOf(marker);

  if (start === -1) return html;

  const nextItem = html.indexOf('currency-tabs__item', start + 1);
  if (nextItem === -1) return html.slice(start);

  return html.slice(start, nextItem);
}

/**
 * Ищем внутри блока строку с нужной валютой
 * и парсим "продажу".
 */
function parseSaleFromBlock(
    block: string,
    currency: "USD" | "EUR" | "JPY"
): number | null {
  const regex = new RegExp(
      `<div\\s+class="currency-table__val">\\s*${currency}\\s*<\\/div>[\\s\\S]*?<div\\s+class="currency-table__head">\\s*покупка\\s*<\\/div>\\s*([\\d.,]+)[\\s\\S]*?<div\\s+class="currency-table__head">\\s*продажа\\s*<\\/div>\\s*([\\d.,]+)`,
      "i"
  );

  const match = block.match(regex);
  if (!match) return null;

  // match[1] — покупка, match[2] — продажа
  const saleRaw = match[2].replace(/\s+/g, "").replace(",", ".");
  const num = Number(saleRaw);

  return Number.isFinite(num) ? num : null;
}

/**
 * Фолбэк через скрытые инпуты.
 * Здесь JPY тоже приводим к формату "RUB за 100¥".
 */
function parseHiddenInputs(html: string): CurrencyRates | null {
  const extract = (name: string) => {
    const regex = new RegExp(`name="${name}"\\s+value="([\\d.,]+)"`, "i");
    const match = html.match(regex);
    if (!match) return null;
    return Number(match[1].replace(",", "."));
  };

  const usd = extract("usd2") ?? extract("usd1");
  const eur = extract("eur2") ?? extract("eur1");
  const jpyRaw = extract("jpy2") ?? extract("jpy1");

  if (!usd || !eur || !jpyRaw) return null;

  // Если банк отдаёт курс за 1¥ (например 0.53) — умножаем на 100.
  // Если уже за 100¥ (например 53.51) — оставляем как есть.
  const jpyPer100 = jpyRaw < 5 ? jpyRaw * 100 : jpyRaw;

  return {
    RUB: 1,
    USD: usd,       // за 1$
    EUR: eur,       // за 1€
    JPY: jpyPer100, // за 100¥
  };
}

import { RateCache } from "./models";

export type SupportedCurrency = "JPY" | "USD" | "EUR" | "RUB";

export interface CurrencyRates {
  [code: string]: number; // to RUB
}

const ATB_URL = "https://www.atb.su/services/exchange/";

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

export function convertToRub(
    amount: number,
    currency: SupportedCurrency,
    rates: CurrencyRates
): number {
  const rate = rates[currency];
  if (!rate) throw new Error(`Unsupported currency ${currency}`);
  return amount * rate;
}

function mapToObject(map: any): CurrencyRates {
  if (!map) return {} as CurrencyRates;
  // Mongoose Map -> plain object
  const entries: [string, number][] = [];
  for (const [key, value] of (map as any).entries
      ? map.entries()
      : Object.entries(map)) {
    entries.push([key, Number(value)]);
  }
  return Object.fromEntries(entries) as CurrencyRates;
}

function hasAll(rates: CurrencyRates): boolean {
  return !!(rates.JPY && rates.USD && rates.EUR && rates.RUB);
}

/**
 * Парсим именно вкладку "для денежных переводов".
 */
function parseAtbRates(html: string): CurrencyRates {
  // 1) Пытаемся вырезать блок по тексту "для денежных переводов"
  const transferBlock = sliceTransfersBlock(html);
  const usdSale = parseSaleFromBlock(transferBlock, "USD");
  const eurSale = parseSaleFromBlock(transferBlock, "EUR");
  const jpySalePer100 = parseSaleFromBlock(transferBlock, "JPY");

  if (usdSale && eurSale && jpySalePer100) {
    return {
      RUB: 1,
      USD: usdSale,
      EUR: eurSale,
      JPY: jpySalePer100 / 100, // convert per 1 ¥
    };
  }

  // 2) Если по тексту не получилось (или верстку сильно поменяли) —
  // пробуем старый способ по id таба (currencyTab4).
  const legacyBlock = sliceTab(html, "currencyTab4");
  const usdLegacy = parseSaleFromBlock(legacyBlock, "USD");
  const eurLegacy = parseSaleFromBlock(legacyBlock, "EUR");
  const jpyLegacyPer100 = parseSaleFromBlock(legacyBlock, "JPY");

  if (usdLegacy && eurLegacy && jpyLegacyPer100) {
    return {
      RUB: 1,
      USD: usdLegacy,
      EUR: eurLegacy,
      JPY: jpyLegacyPer100 / 100,
    };
  }

  // 3) Фолбэк — скрытые инпуты, если вообще всё поменяли.
  const hidden = parseHiddenInputs(html);
  if (hidden) return hidden;

  throw new Error("ATB transfer rates not found or malformed");
}

/**
 * Вырезаем HTML-блок, относящийся к вкладке
 * с текстом "для денежных переводов".
 */
function sliceTransfersBlock(html: string): string {
  const lower = html.toLowerCase();
  const labelIndex = lower.indexOf("для денежных переводов");
  if (labelIndex === -1) {
    // если не нашли текст — вернем исходный html, дальше парсер попытается legacy/hidden
    return html;
  }

  // Ищем поблизости таблицу с курсами
  const tableIndex = lower.indexOf("currency-table", labelIndex);
  if (tableIndex === -1) {
    // нет явного класса таблицы — режем от текста и дальше
    return html.slice(labelIndex);
  }

  // Ограничим блок до следующего элемента табов/секции,
  // чтобы не хватать лишнее.
  const nextTabIndex =
      lower.indexOf("currency-tabs__item", tableIndex + 1) !== -1
          ? lower.indexOf("currency-tabs__item", tableIndex + 1)
          : lower.indexOf("currency-tab", tableIndex + 1); // запасной вариант

  const end =
      nextTabIndex !== -1 && nextTabIndex > tableIndex ? nextTabIndex : html.length;

  return html.slice(tableIndex, end);
}

/**
 * Старый метод — вырезает блок по id таба.
 * Оставляем как резервный вариант.
 */
function sliceTab(html: string, id: string): string {
  const start = html.indexOf(`id="${id}"`);
  if (start === -1) return html;
  const next = html.indexOf("currency-tabs__item", start + 1);
  if (next === -1) return html.slice(start);
  return html.slice(start, next);
}

function parseSaleFromBlock(
    block: string,
    currency: "USD" | "EUR" | "JPY"
): number | null {
  const regex = new RegExp(
      `<div class="currency-table__val">${currency}</div>[\\s\\S]*?<div class="currency-table__head">покупка</div>\\s*([\\d.,]+)[\\s\\S]*?<div class="currency-table__head">продажа</div>\\s*([\\d.,]+)`,
      "i"
  );
  const match = block.match(regex);
  if (!match) return null;
  const sale = match[2]?.replace(/\s+/g, "").replace(",", ".");
  const num = Number(sale);
  return Number.isFinite(num) ? num : null;
}

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

  const jpy = jpyRaw > 5 ? jpyRaw / 100 : jpyRaw;

  return {
    RUB: 1,
    USD: usd,
    EUR: eur,
    JPY: jpy,
  };
}

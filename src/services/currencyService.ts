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

export function convertToRub(amount: number, currency: SupportedCurrency, rates: CurrencyRates): number {
  const rate = rates[currency];
  if (!rate) throw new Error(`Unsupported currency ${currency}`);
  return amount * rate;
}

function mapToObject(map: any): CurrencyRates {
  if (!map) return {} as CurrencyRates;
  // Mongoose Map -> plain object
  const entries: [string, number][] = [];
  for (const [key, value] of (map as any).entries ? map.entries() : Object.entries(map)) {
    entries.push([key, Number(value)]);
  }
  return Object.fromEntries(entries) as CurrencyRates;
}

function hasAll(rates: CurrencyRates): boolean {
  return !!(rates.JPY && rates.USD && rates.EUR && rates.RUB);
}

function parseAtbRates(html: string): CurrencyRates {
  // Primary: table "для денежных переводов"
  const transferBlock = sliceTab(html, "currencyTab4");
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

  // Fallback: hidden inputs (jpy1/2, usd1/2, eur1/2)
  const hidden = parseHiddenInputs(html);
  if (hidden) return hidden;

  throw new Error("ATB transfer rates not found or malformed");
}

function sliceTab(html: string, id: string): string {
  const start = html.indexOf(`id="${id}"`);
  if (start === -1) return html;
  const next = html.indexOf('currency-tabs__item', start + 1);
  if (next === -1) return html.slice(start);
  return html.slice(start, next);
}

function parseSaleFromBlock(block: string, currency: "USD" | "EUR" | "JPY"): number | null {
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

  // Hidden inputs могут быть либо за 1¥ (~0.x), либо за 100¥ (~50.x)
  const jpy = jpyRaw > 5 ? jpyRaw / 100 : jpyRaw;

  return {
    RUB: 1,
    USD: usd,
    EUR: eur,
    JPY: jpy,
  };
}

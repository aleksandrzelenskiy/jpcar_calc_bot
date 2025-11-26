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
  const transferBlock = sliceTab(html, "currencyTab4");
  const usdSale = parseSaleFromBlock(transferBlock, "USD");
  const eurSale = parseSaleFromBlock(transferBlock, "EUR");
  const jpySalePer100 = parseSaleFromBlock(transferBlock, "JPY");

  if (!usdSale || !eurSale || !jpySalePer100) {
    throw new Error("ATB transfer rates not found or malformed");
  }

  return {
    RUB: 1,
    USD: usdSale,
    EUR: eurSale,
    JPY: jpySalePer100 / 100, // convert per 1 ¥
  };
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

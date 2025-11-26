import { RateCache } from "./models";

export type SupportedCurrency = "JPY" | "USD" | "EUR" | "RUB";

export interface CurrencyRates {
  [code: string]: number; // to RUB
}

const CBR_URL = "https://www.cbr-xml-daily.ru/daily_json.js";

export async function getRates(): Promise<CurrencyRates> {
  const today = new Date().toISOString().slice(0, 10);
  const cached = await RateCache.findOne({ date: today });
  if (cached) {
    const rates = mapToObject(cached.rates);
    if (hasAll(rates)) return rates;
  }

  const response = await fetch(CBR_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch rates: ${response.statusText}`);
  }
  const data = (await response.json()) as any;
  const valute = data?.Valute;
  const rates: CurrencyRates = {
    RUB: 1,
    USD: normalizeRate(valute?.USD),
    EUR: normalizeRate(valute?.EUR),
    JPY: normalizeRate(valute?.JPY),
  };

  await RateCache.findOneAndUpdate(
    { date: today },
    { rates },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return rates;
}

function normalizeRate(entry: any): number {
  if (!entry?.Value || !entry?.Nominal) {
    throw new Error("Currency rate missing required fields");
  }
  return entry.Value / entry.Nominal;
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

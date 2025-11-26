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
  const rates = parseAtbRates(html);

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
  const extract = (name: string) => {
    const regex = new RegExp(`name="${name}"\\s+value="([\\d.,]+)"`, "i");
    const match = html.match(regex);
    if (!match) return null;
    return Number(match[1].replace(",", "."));
  };

  const usd = extract("usd2") ?? extract("usd1");
  const eur = extract("eur2") ?? extract("eur1");
  const jpy = extract("jpy2") ?? extract("jpy1");

  if (!usd || !eur || !jpy) {
    throw new Error("ATB rates not found or malformed");
  }

  return {
    RUB: 1,
    USD: usd,
    EUR: eur,
    JPY: jpy,
  };
}

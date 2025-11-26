const rubFormatter = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 0,
});

export function formatRub(value: number): string {
  return rubFormatter.format(Math.round(value));
}

export function round(value: number, digits = 0): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function formatCurrencyRounded(value: number): string {
  const rounded = Math.round(value / 1000) * 1000;
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 0,
  }).format(Math.round(rounded));
}

export function formatCurrencyRange(min: number, max: number): string {
  const formatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
  return `${formatter.format(Math.round(min))}–${formatter.format(Math.round(max))}`;
}

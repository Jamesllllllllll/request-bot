import type { AppLocale } from "./locales";

export function formatDate(
  locale: AppLocale,
  value: number | string | Date,
  options: Intl.DateTimeFormatOptions
) {
  return new Intl.DateTimeFormat(locale, options).format(new Date(value));
}

export function formatNumber(
  locale: AppLocale,
  value: number,
  options?: Intl.NumberFormatOptions
) {
  return new Intl.NumberFormat(locale, options).format(value);
}

export function formatCurrency(
  locale: AppLocale,
  value: number,
  currency: string,
  options?: Omit<Intl.NumberFormatOptions, "style" | "currency">
) {
  return new Intl.NumberFormat(locale, {
    ...options,
    style: "currency",
    currency,
  }).format(value);
}

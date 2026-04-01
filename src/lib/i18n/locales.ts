export const supportedLocales = ["en", "es", "fr", "pt-BR"] as const;

export type AppLocale = (typeof supportedLocales)[number];

export const defaultLocale: AppLocale = "en";

export const localeOptions: Array<{ value: AppLocale; nativeLabel: string }> = [
  { value: "en", nativeLabel: "English" },
  { value: "es", nativeLabel: "Español" },
  { value: "fr", nativeLabel: "Français" },
  { value: "pt-BR", nativeLabel: "Português (Brasil)" },
];

export function isSupportedLocale(value: string): value is AppLocale {
  return supportedLocales.includes(value as AppLocale);
}

export function normalizeLocale(value: string | null | undefined) {
  const normalized = value?.trim().replace(/_/g, "-");
  if (!normalized) {
    return null;
  }

  if (isSupportedLocale(normalized)) {
    return normalized;
  }

  const lower = normalized.toLowerCase();

  if (lower === "pt-br") {
    return "pt-BR";
  }

  const [baseLocale] = lower.split("-");
  return baseLocale === "en" || baseLocale === "es" || baseLocale === "fr"
    ? baseLocale
    : null;
}

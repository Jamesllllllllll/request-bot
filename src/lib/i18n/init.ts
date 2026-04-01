import type { InitOptions } from "i18next";
import { websiteNamespaces } from "./config";
import { type AppLocale, defaultLocale } from "./locales";
import { i18nResources } from "./resources";

const warnedMissingKeys = new Set<string>();
const shouldWarnOnMissingKeys =
  import.meta.env.DEV && import.meta.env.MODE !== "test";

function warnMissingKey(
  languages: readonly string[] | string,
  namespaces: readonly string[] | string,
  key: string
) {
  if (!shouldWarnOnMissingKeys) {
    return;
  }

  const requestedLanguage = Array.isArray(languages)
    ? (languages[0] ?? defaultLocale)
    : languages;
  const requestedNamespace = Array.isArray(namespaces)
    ? (namespaces[0] ?? "common")
    : namespaces;
  const warningKey = `${requestedLanguage}:${requestedNamespace}:${key}`;

  if (warnedMissingKeys.has(warningKey)) {
    return;
  }

  warnedMissingKeys.add(warningKey);
  console.warn(
    `[i18n] Missing translation key "${requestedNamespace}.${key}" for locale "${requestedLanguage}".`
  );
}

export function getI18nInitOptions(locale: AppLocale): InitOptions {
  return {
    resources: i18nResources,
    lng: locale,
    fallbackLng: defaultLocale,
    supportedLngs: Object.keys(i18nResources),
    defaultNS: "common",
    ns: [...websiteNamespaces],
    interpolation: {
      escapeValue: false,
    },
    initAsync: false,
    returnNull: false,
    saveMissing: shouldWarnOnMissingKeys,
    missingKeyHandler: shouldWarnOnMissingKeys ? warnMissingKey : undefined,
  };
}

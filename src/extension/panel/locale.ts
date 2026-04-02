import {
  readExplicitDeviceLocale,
  readExplicitLocaleCookie,
} from "~/lib/i18n/detect";
import {
  type AppLocale,
  defaultLocale,
  normalizeLocale,
} from "~/lib/i18n/locales";

const panelLocaleStorageKey = "request-bot:extension-panel-locale";

export function resolveExtensionPanelLocale(input?: {
  search?: string | null;
  storedLocale?: string | null;
  cookieLocale?: string | null;
  documentLanguage?: string | null;
  navigatorLanguage?: string | null;
  viewerPreferredLocale?: string | null;
  channelDefaultLocale?: string | null;
}) {
  const params = new URLSearchParams(input?.search ?? "");

  return (
    normalizeLocale(input?.storedLocale) ??
    normalizeLocale(input?.viewerPreferredLocale) ??
    normalizeLocale(input?.cookieLocale) ??
    normalizeLocale(params.get("locale")) ??
    normalizeLocale(params.get("language")) ??
    normalizeLocale(input?.documentLanguage) ??
    normalizeLocale(input?.navigatorLanguage) ??
    normalizeLocale(input?.channelDefaultLocale) ??
    defaultLocale
  );
}

function readPanelExplicitLocale() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return normalizeLocale(window.localStorage.getItem(panelLocaleStorageKey));
  } catch {
    return null;
  }
}

export function readPanelStoredLocale() {
  return (
    readPanelExplicitLocale() ??
    readExplicitDeviceLocale() ??
    readExplicitLocaleCookie()
  );
}

export function persistPanelStoredLocale(locale: AppLocale) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(panelLocaleStorageKey, locale);
  } catch {
    // Ignore local storage failures in restricted browser contexts.
  }
}

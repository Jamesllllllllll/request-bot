import {
  readExplicitDeviceLocale,
  readExplicitLocaleCookie,
} from "~/lib/i18n/detect";
import { defaultLocale, normalizeLocale } from "~/lib/i18n/locales";

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
    normalizeLocale(input?.viewerPreferredLocale) ??
    normalizeLocale(input?.storedLocale) ??
    normalizeLocale(input?.cookieLocale) ??
    normalizeLocale(params.get("locale")) ??
    normalizeLocale(params.get("language")) ??
    normalizeLocale(input?.documentLanguage) ??
    normalizeLocale(input?.navigatorLanguage) ??
    normalizeLocale(input?.channelDefaultLocale) ??
    defaultLocale
  );
}

export function readPanelStoredLocale() {
  return readExplicitDeviceLocale() ?? readExplicitLocaleCookie();
}

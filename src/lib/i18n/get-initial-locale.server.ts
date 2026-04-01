import { getCookie } from "@tanstack/react-start/server";
import { localeCookieName } from "~/lib/i18n/config";
import { defaultLocale, normalizeLocale } from "~/lib/i18n/locales";

export function getInitialLocaleFromRequest() {
  return normalizeLocale(getCookie(localeCookieName)) ?? defaultLocale;
}

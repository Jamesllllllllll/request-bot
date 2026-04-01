import {
  localeCookieMaxAgeSeconds,
  localeCookieName,
  localeStorageKey,
} from "./config";
import { type AppLocale, defaultLocale, normalizeLocale } from "./locales";

export function resolveExplicitLocale(input: {
  userPreferredLocale?: string | null;
  storedLocale?: string | null;
}) {
  return (
    normalizeLocale(input.userPreferredLocale) ??
    normalizeLocale(input.storedLocale) ??
    defaultLocale
  );
}

export function readExplicitDeviceLocale() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return normalizeLocale(window.localStorage.getItem(localeStorageKey));
  } catch {
    return null;
  }
}

export function readExplicitLocaleCookie() {
  if (typeof document === "undefined") {
    return null;
  }

  const cookie = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${localeCookieName}=`));

  return normalizeLocale(cookie?.split("=").slice(1).join("=") ?? null);
}

export function persistExplicitDeviceLocale(locale: AppLocale) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(localeStorageKey, locale);
  } catch {
    // Ignore local storage failures in restricted browser contexts.
  }
}

export function persistExplicitLocaleCookie(locale: AppLocale) {
  if (typeof document === "undefined") {
    return;
  }

  const secureFlag = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${localeCookieName}=${encodeURIComponent(locale)}; Path=/; SameSite=Lax; Max-Age=${localeCookieMaxAgeSeconds}${secureFlag}`;
}

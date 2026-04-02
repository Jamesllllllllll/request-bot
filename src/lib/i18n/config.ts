export const localeCookieName = "rb_locale";
export const localeStorageKey = "request-bot:locale";
export const localeCookieMaxAgeSeconds = 60 * 60 * 24 * 365;

export const websiteNamespaces = [
  "common",
  "bot",
  "home",
  "search",
  "dashboard",
  "admin",
  "playlist",
  "extension",
] as const;

export type WebsiteNamespace = (typeof websiteNamespaces)[number];

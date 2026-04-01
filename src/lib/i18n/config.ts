export const localeCookieName = "rb_locale";
export const localeStorageKey = "request-bot:locale";
export const localeCookieMaxAgeSeconds = 60 * 60 * 24 * 365;

export const websiteNamespaces = [
  "common",
  "home",
  "search",
  "dashboard",
  "admin",
  "playlist",
] as const;

export type WebsiteNamespace = (typeof websiteNamespaces)[number];

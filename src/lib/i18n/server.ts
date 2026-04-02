import { createInstance } from "i18next";
import ICU from "i18next-icu";
import { getLocaleCookie } from "~/lib/auth/session.server";
import type { AppEnv } from "~/lib/env";
import { resolveExplicitLocale } from "./detect";
import { getI18nInitOptions } from "./init";
import { defaultLocale, normalizeLocale } from "./locales";

export function resolveRequestLocale(
  request: Request,
  _env: AppEnv,
  userPreferredLocale?: string | null
) {
  return resolveExplicitLocale({
    userPreferredLocale,
    storedLocale: getLocaleCookie(request),
  });
}

export function getServerTranslation(
  locale: string | null | undefined,
  namespace?: string | string[]
) {
  const resolvedLocale = normalizeLocale(locale) ?? defaultLocale;
  const instance = createInstance();

  void instance.use(ICU).init(getI18nInitOptions(resolvedLocale));

  return {
    locale: resolvedLocale,
    t: instance.getFixedT(resolvedLocale, namespace),
  };
}

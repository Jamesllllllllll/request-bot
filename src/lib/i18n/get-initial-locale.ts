import { createIsomorphicFn } from "@tanstack/react-start";
import { readExplicitLocaleCookie } from "~/lib/i18n/detect";
import { defaultLocale } from "~/lib/i18n/locales";

export const getInitialLocale = createIsomorphicFn()
  .server(async () => {
    const { getInitialLocaleFromRequest } = await import(
      "~/lib/i18n/get-initial-locale.server"
    );

    return getInitialLocaleFromRequest();
  })
  .client(() => readExplicitLocaleCookie() ?? defaultLocale);

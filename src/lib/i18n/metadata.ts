import {
  createInstance,
  type i18n as I18nInstance,
  type TOptions,
} from "i18next";
import ICU from "i18next-icu";
import { pageTitle } from "~/lib/page-title";
import type { WebsiteNamespace } from "./config";
import { getInitialLocale } from "./get-initial-locale";
import { getI18nInitOptions } from "./init";
import type { AppLocale } from "./locales";

const metadataI18nByLocale = new Map<AppLocale, I18nInstance>();

function getMetadataI18n(locale: AppLocale) {
  const existing = metadataI18nByLocale.get(locale);
  if (existing) {
    return existing;
  }

  const instance = createInstance();

  void instance.use(ICU).init(getI18nInitOptions(locale));

  metadataI18nByLocale.set(locale, instance);
  return instance;
}

export async function getLocalizedPageTitle(input: {
  namespace: WebsiteNamespace;
  key: string;
  options?: TOptions;
}) {
  const locale = await getInitialLocale();
  const title = getMetadataI18n(locale).t(input.key, {
    ns: input.namespace,
    ...input.options,
  });

  return pageTitle(title);
}

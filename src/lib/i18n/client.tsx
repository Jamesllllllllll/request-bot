import { createInstance, type i18n as I18nInstance } from "i18next";
import ICU from "i18next-icu";
import {
  createContext,
  type PropsWithChildren,
  startTransition,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  I18nextProvider,
  initReactI18next,
  useTranslation,
} from "react-i18next";
import {
  persistExplicitDeviceLocale,
  persistExplicitLocaleCookie,
} from "./detect";
import { getI18nInitOptions } from "./init";
import type { AppLocale } from "./locales";

type AppLocaleContextValue = {
  locale: AppLocale;
  setLocale(locale: AppLocale): Promise<void>;
  isSavingLocale: boolean;
};

const AppLocaleContext = createContext<AppLocaleContextValue | null>(null);

function createI18n(locale: AppLocale) {
  const instance = createInstance();

  void instance.use(ICU).use(initReactI18next).init(getI18nInitOptions(locale));

  return instance;
}

export function AppI18nProvider(
  props: PropsWithChildren<{ initialLocale: AppLocale }>
) {
  const [locale, setLocaleState] = useState<AppLocale>(props.initialLocale);
  const [isSavingLocale, setIsSavingLocale] = useState(false);
  const [i18n] = useState<I18nInstance>(() => createI18n(props.initialLocale));

  useEffect(() => {
    document.documentElement.lang = locale;
    void i18n.changeLanguage(locale);
  }, [i18n, locale]);

  async function setLocale(nextLocale: AppLocale) {
    if (nextLocale === locale) {
      return;
    }

    startTransition(() => {
      setLocaleState(nextLocale);
    });
    persistExplicitDeviceLocale(nextLocale);
    persistExplicitLocaleCookie(nextLocale);
    setIsSavingLocale(true);

    try {
      await fetch("/api/session/locale", {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ locale: nextLocale }),
      });
    } catch (error) {
      console.error("Failed to persist locale preference", error);
    } finally {
      setIsSavingLocale(false);
    }
  }

  return (
    <AppLocaleContext.Provider value={{ locale, setLocale, isSavingLocale }}>
      <I18nextProvider i18n={i18n}>{props.children}</I18nextProvider>
    </AppLocaleContext.Provider>
  );
}

export function useAppLocale() {
  const context = useContext(AppLocaleContext);
  if (!context) {
    throw new Error("useAppLocale must be used within AppI18nProvider.");
  }

  return context;
}

export function useLocaleTranslation(namespace?: string | string[]) {
  return useTranslation(namespace);
}

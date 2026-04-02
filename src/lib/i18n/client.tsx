import { createInstance, type i18n as I18nInstance } from "i18next";
import ICU from "i18next-icu";
import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  I18nextProvider,
  initReactI18next,
  useTranslation,
} from "react-i18next";
import { persistExplicitDeviceLocale } from "./detect";
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

function syncLocale(i18n: I18nInstance, locale: AppLocale) {
  if (typeof document !== "undefined") {
    document.documentElement.lang = locale;
  }

  void i18n.changeLanguage(locale);
}

export function getSyncedLocaleFromInitial(input: {
  currentLocale: AppLocale;
  previousInitialLocale: AppLocale;
  nextInitialLocale: AppLocale;
}) {
  return input.previousInitialLocale !== input.nextInitialLocale
    ? input.nextInitialLocale
    : input.currentLocale;
}

export function AppI18nProvider(
  props: PropsWithChildren<{ initialLocale: AppLocale }>
) {
  const [locale, setLocaleState] = useState<AppLocale>(props.initialLocale);
  const [isSavingLocale, setIsSavingLocale] = useState(false);
  const [i18n] = useState<I18nInstance>(() => createI18n(props.initialLocale));
  const previousInitialLocaleRef = useRef<AppLocale>(props.initialLocale);

  useEffect(() => {
    syncLocale(i18n, locale);
  }, [i18n, locale]);

  useEffect(() => {
    const nextLocale = getSyncedLocaleFromInitial({
      currentLocale: locale,
      previousInitialLocale: previousInitialLocaleRef.current,
      nextInitialLocale: props.initialLocale,
    });
    previousInitialLocaleRef.current = props.initialLocale;

    if (nextLocale === locale) {
      return;
    }

    syncLocale(i18n, nextLocale);
    setLocaleState(nextLocale);
  }, [locale, props.initialLocale]);

  async function setLocale(nextLocale: AppLocale) {
    if (nextLocale === locale) {
      return;
    }

    syncLocale(i18n, nextLocale);
    setLocaleState(nextLocale);
    persistExplicitDeviceLocale(nextLocale);
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

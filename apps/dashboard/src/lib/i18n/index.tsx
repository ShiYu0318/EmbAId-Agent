"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import en from "./messages/en";
import zhTW from "./messages/zh-TW";
import type { LocaleMessages } from "./messages/schema";
import { translate, type TranslationParams, type TranslationTree } from "./translate";

export type Locale = "zh-TW" | "en";

export const LOCALES: Locale[] = ["zh-TW", "en"];
export const DEFAULT_LOCALE: Locale = "zh-TW";
export const FALLBACK_LOCALE: Locale = "en";

export const LOCALE_LABELS: Record<Locale, string> = {
  "zh-TW": "繁體中文",
  en: "English",
};

export const dictionaries: Record<Locale, LocaleMessages> = {
  "zh-TW": zhTW,
  en,
};

const asTrees = dictionaries as unknown as Record<string, TranslationTree>;

export type TranslateFn = (path: string, params?: TranslationParams) => string;

export function createTranslator(locale: Locale): TranslateFn {
  return (path, params) => translate(asTrees, locale, FALLBACK_LOCALE, path, params);
}

const STORAGE_KEY = "embaid.locale";

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: TranslateFn;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function isLocale(value: string | null): value is Locale {
  return value === "zh-TW" || value === "en";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isLocale(stored)) {
      setLocaleState(stored);
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const value = useMemo<I18nContextValue>(
    () => ({ locale, setLocale, t: createTranslator(locale) }),
    [locale, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within an I18nProvider");
  }
  return context;
}

export function useT(): TranslateFn {
  return useI18n().t;
}

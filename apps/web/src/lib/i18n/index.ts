import i18next from 'i18next';
import { defaultLanguage, languages } from './config';

// Import translation files
import enCommon from './locales/en/common.json';
import enArticles from './locales/en/articles.json';
import enNavigation from './locales/en/navigation.json';

import esCommon from './locales/es/common.json';
import esArticles from './locales/es/articles.json';
import esNavigation from './locales/es/navigation.json';

import frCommon from './locales/fr/common.json';
import frArticles from './locales/fr/articles.json';
import frNavigation from './locales/fr/navigation.json';

import deCommon from './locales/de/common.json';
import deArticles from './locales/de/articles.json';
import deNavigation from './locales/de/navigation.json';

import jaCommon from './locales/ja/common.json';
import jaArticles from './locales/ja/articles.json';
import jaNavigation from './locales/ja/navigation.json';

import arCommon from './locales/ar/common.json';
import arArticles from './locales/ar/articles.json';
import arNavigation from './locales/ar/navigation.json';

import heCommon from './locales/he/common.json';
import heArticles from './locales/he/articles.json';
import heNavigation from './locales/he/navigation.json';

// Initialize i18next
if (!i18next.isInitialized) {
  i18next.init({
    lng: defaultLanguage,
    fallbackLng: defaultLanguage,
    supportedLngs: Object.keys(languages),
    defaultNS: 'common',
    ns: ['common', 'articles', 'navigation'],
    resources: {
      en: {
        common: enCommon,
        articles: enArticles,
        navigation: enNavigation,
      },
      es: {
        common: esCommon,
        articles: esArticles,
        navigation: esNavigation,
      },
      fr: {
        common: frCommon,
        articles: frArticles,
        navigation: frNavigation,
      },
      de: {
        common: deCommon,
        articles: deArticles,
        navigation: deNavigation,
      },
      ja: {
        common: jaCommon,
        articles: jaArticles,
        navigation: jaNavigation,
      },
      ar: {
        common: arCommon,
        articles: arArticles,
        navigation: arNavigation,
      },
      he: {
        common: heCommon,
        articles: heArticles,
        navigation: heNavigation,
      },
    },
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false,
    },
  });
}

export default i18next;

// Helper function to get translation
export function t(key: string, options?: Record<string, unknown>, language?: string): string {
  if (language) {
    return i18next.getFixedT(language)(key, options);
  }
  return i18next.t(key, options);
}

// Change language
export function changeLanguage(language: string): Promise<void> {
  return new Promise((resolve, reject) => {
    i18next.changeLanguage(language, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

// Get current language
export function getCurrentLanguage(): string {
  return i18next.language || defaultLanguage;
}

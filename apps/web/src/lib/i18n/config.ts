import type { UserConfig } from 'astro-i18next/types';

export const languages = {
  en: 'English',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  ja: '日本語',
  ar: 'العربية',
  he: 'עברית',
} as const;

export const defaultLanguage = 'en';

export const rtlLanguages = ['ar', 'he'];

export const isRtl = (lang: string): boolean => rtlLanguages.includes(lang);

export const i18nConfig: UserConfig = {
  defaultLocale: defaultLanguage,
  locales: Object.keys(languages),
  strategy: 'prefix',
  defaultNamespace: 'common',
  namespaces: ['common', 'articles', 'navigation'],
  i18nextConfig: {
    react: { useSuspense: false },
  },
};

export default i18nConfig;

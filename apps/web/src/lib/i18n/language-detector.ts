import { franc } from 'franc';

// Language code mapping from franc to ISO 639-1
const francToIso: Record<string, string> = {
  eng: 'en',
  spa: 'es',
  fra: 'fr',
  deu: 'de',
  jpn: 'ja',
  ara: 'ar',
  heb: 'he',
  por: 'pt',
  rus: 'ru',
  zho: 'zh',
  ita: 'it',
  nld: 'nl',
  pol: 'pl',
  tur: 'tr',
  kor: 'ko',
  hin: 'hi',
  und: 'en', // Default to English for undetermined
};

// Supported languages
const supportedLanguages = ['en', 'es', 'fr', 'de', 'ja', 'ar', 'he'];

export function detectLanguage(text: string): string {
  // Need at least 10 characters for reliable detection
  if (text.length < 10) {
    return 'en';
  }

  try {
    const detected = franc(text, { minLength: 10 });
    const isoCode = francToIso[detected] || 'en';
    
    // Return the detected language if supported, otherwise default to English
    return supportedLanguages.includes(isoCode) ? isoCode : 'en';
  } catch (error) {
    console.error('Language detection error:', error);
    return 'en';
  }
}

export function getLanguageName(code: string): string {
  const names: Record<string, string> = {
    en: 'English',
    es: 'Spanish',
    fr: 'French',
    de: 'German',
    ja: 'Japanese',
    ar: 'Arabic',
    he: 'Hebrew',
  };
  return names[code] || code.toUpperCase();
}

export function isLanguageSupported(code: string): boolean {
  return supportedLanguages.includes(code);
}

// OC-121: Multi-language Support Configuration

export type Language = {
  code: string;
  name: string;
  nativeName: string;
  direction: 'ltr' | 'rtl';
  dateFormat: string;
  numberFormat: {
    decimal: string;
    thousand: string;
  };
};

export const SUPPORTED_LANGUAGES: Language[] = [
  {
    code: 'en',
    name: 'English',
    nativeName: 'English',
    direction: 'ltr',
    dateFormat: 'MM/DD/YYYY',
    numberFormat: { decimal: '.', thousand: ',' }
  },
  {
    code: 'es',
    name: 'Spanish',
    nativeName: 'Español',
    direction: 'ltr',
    dateFormat: 'DD/MM/YYYY',
    numberFormat: { decimal: ',', thousand: '.' }
  },
  {
    code: 'fr',
    name: 'French',
    nativeName: 'Français',
    direction: 'ltr',
    dateFormat: 'DD/MM/YYYY',
    numberFormat: { decimal: ',', thousand: ' ' }
  },
  {
    code: 'de',
    name: 'German',
    nativeName: 'Deutsch',
    direction: 'ltr',
    dateFormat: 'DD.MM.YYYY',
    numberFormat: { decimal: ',', thousand: '.' }
  },
  {
    code: 'zh-CN',
    name: 'Chinese (Simplified)',
    nativeName: '简体中文',
    direction: 'ltr',
    dateFormat: 'YYYY-MM-DD',
    numberFormat: { decimal: '.', thousand: ',' }
  },
  {
    code: 'ja',
    name: 'Japanese',
    nativeName: '日本語',
    direction: 'ltr',
    dateFormat: 'YYYY/MM/DD',
    numberFormat: { decimal: '.', thousand: ',' }
  },
  {
    code: 'ko',
    name: 'Korean',
    nativeName: '한국어',
    direction: 'ltr',
    dateFormat: 'YYYY.MM.DD',
    numberFormat: { decimal: '.', thousand: ',' }
  },
  {
    code: 'ar',
    name: 'Arabic',
    nativeName: 'العربية',
    direction: 'rtl',
    dateFormat: 'DD/MM/YYYY',
    numberFormat: { decimal: '٫', thousand: '٬' }
  },
  {
    code: 'he',
    name: 'Hebrew',
    nativeName: 'עברית',
    direction: 'rtl',
    dateFormat: 'DD/MM/YYYY',
    numberFormat: { decimal: '.', thousand: ',' }
  },
  {
    code: 'pt',
    name: 'Portuguese',
    nativeName: 'Português',
    direction: 'ltr',
    dateFormat: 'DD/MM/YYYY',
    numberFormat: { decimal: ',', thousand: '.' }
  },
  {
    code: 'ru',
    name: 'Russian',
    nativeName: 'Русский',
    direction: 'ltr',
    dateFormat: 'DD.MM.YYYY',
    numberFormat: { decimal: ',', thousand: ' ' }
  }
];

export const DEFAULT_LANGUAGE = 'en';

export const RTL_LANGUAGES = SUPPORTED_LANGUAGES
  .filter(lang => lang.direction === 'rtl')
  .map(lang => lang.code);

export function getLanguage(code: string): Language | undefined {
  return SUPPORTED_LANGUAGES.find(lang => lang.code === code);
}

export function isRTL(code: string): boolean {
  return RTL_LANGUAGES.includes(code);
}

export function isValidLanguage(code: string): boolean {
  return SUPPORTED_LANGUAGES.some(lang => lang.code === code);
}

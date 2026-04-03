// OC-121: i18n Utilities

import { getLanguage, isRTL, type Language } from './config';

/**
 * Detect language from URL path
 * Example: /es/articles/my-article -> 'es'
 */
export function getLanguageFromPath(pathname: string): string | null {
  const segments = pathname.split('/').filter(Boolean);
  const firstSegment = segments[0];
  
  if (firstSegment && /^[a-z]{2}(-[A-Z]{2})?$/.test(firstSegment)) {
    return firstSegment;
  }
  
  return null;
}

/**
 * Build localized URL
 * Example: buildLocalizedUrl('/articles/my-article', 'es') -> '/es/articles/my-article'
 */
export function buildLocalizedUrl(path: string, languageCode: string, defaultLanguage: string = 'en'): string {
  // Remove existing language prefix if present
  const pathWithoutLang = removeLanguageFromPath(path);
  
  // Don't prefix default language
  if (languageCode === defaultLanguage) {
    return pathWithoutLang || '/';
  }
  
  // Add language prefix
  const normalizedPath = pathWithoutLang.startsWith('/') ? pathWithoutLang : `/${pathWithoutLang}`;
  return `/${languageCode}${normalizedPath}`;
}

/**
 * Remove language prefix from path
 * Example: removeLanguageFromPath('/es/articles/my-article') -> '/articles/my-article'
 */
export function removeLanguageFromPath(path: string): string {
  const segments = path.split('/').filter(Boolean);
  
  if (segments.length > 0 && /^[a-z]{2}(-[A-Z]{2})?$/.test(segments[0])) {
    return '/' + segments.slice(1).join('/');
  }
  
  return path;
}

/**
 * Format date according to language locale
 */
export function formatDate(date: Date | string, languageCode: string): string {
  const lang = getLanguage(languageCode);
  const d = typeof date === 'string' ? new Date(date) : date;
  
  if (!lang) {
    return d.toLocaleDateString('en-US');
  }
  
  // Use Intl.DateTimeFormat for better locale support
  const locale = languageCode === 'zh-CN' ? 'zh-CN' :
                 languageCode === 'ja' ? 'ja-JP' :
                 languageCode === 'ko' ? 'ko-KR' :
                 languageCode === 'ar' ? 'ar-SA' :
                 languageCode === 'he' ? 'he-IL' :
                 languageCode === 'ru' ? 'ru-RU' :
                 languageCode === 'zh-CN' ? 'zh-CN' :
                 languageCode;
  
  return d.toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

/**
 * Format number according to language locale
 */
export function formatNumber(num: number, languageCode: string): string {
  const lang = getLanguage(languageCode);
  
  if (!lang) {
    return num.toLocaleString('en-US');
  }
  
  const locale = languageCode === 'zh-CN' ? 'zh-CN' :
                 languageCode === 'ja' ? 'ja-JP' :
                 languageCode === 'ko' ? 'ko-KR' :
                 languageCode === 'ar' ? 'ar-SA' :
                 languageCode === 'he' ? 'he-IL' :
                 languageCode === 'ru' ? 'ru-RU' :
                 languageCode;
  
  return num.toLocaleString(locale);
}

/**
 * Get text direction for language
 */
export function getTextDirection(languageCode: string): 'ltr' | 'rtl' {
  return isRTL(languageCode) ? 'rtl' : 'ltr';
}

/**
 * Get HTML lang attribute value
 */
export function getHtmlLang(languageCode: string): string {
  return languageCode;
}

/**
 * Get HTML dir attribute value
 */
export function getHtmlDir(languageCode: string): 'ltr' | 'rtl' {
  return getTextDirection(languageCode);
}

/**
 * Extract language preference from Accept-Language header
 */
export function parseAcceptLanguage(acceptLanguage: string | null): string[] {
  if (!acceptLanguage) return [];
  
  return acceptLanguage
    .split(',')
    .map(lang => {
      const parts = lang.trim().split(';');
      const code = parts[0].trim();
      const quality = parts[1]?.match(/q=(\d+\.?\d*)/)?.[1] || '1';
      return { code, quality: parseFloat(quality) };
    })
    .sort((a, b) => b.quality - a.quality)
    .map(item => item.code);
}

/**
 * Get best matching language from user preferences
 */
export function getBestMatchingLanguage(
  preferredLanguages: string[],
  supportedLanguages: string[],
  defaultLanguage: string = 'en'
): string {
  for (const preferred of preferredLanguages) {
    // Exact match
    if (supportedLanguages.includes(preferred)) {
      return preferred;
    }
    
    // Language code match (e.g., 'en' for 'en-US')
    const baseLang = preferred.split('-')[0];
    const match = supportedLanguages.find(supported => 
      supported === baseLang || supported.startsWith(`${baseLang}-`)
    );
    if (match) {
      return match;
    }
  }
  
  return defaultLanguage;
}

// OC-121: i18n Middleware

import { defineMiddleware } from 'astro:middleware';
import { 
  isValidLanguage, 
  DEFAULT_LANGUAGE,
  parseAcceptLanguage,
  getBestMatchingLanguage,
  SUPPORTED_LANGUAGES
} from '../lib/i18n';

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  
  // Skip static assets and API routes
  if (
    pathname.startsWith('/_astro') ||
    pathname.startsWith('/api') ||
    pathname.includes('.') // Static files
  ) {
    return next();
  }
  
  // Extract language from URL path
  const segments = pathname.split('/').filter(Boolean);
  const firstSegment = segments[0];
  
  // Check if first segment is a language code
  const hasLanguagePrefix = firstSegment && /^[a-z]{2}(-[A-Z]{2})?$/.test(firstSegment);
  
  if (hasLanguagePrefix && isValidLanguage(firstSegment)) {
    // Language is in URL, set locale
    const languageCode = firstSegment;
    context.currentLocale = languageCode as any;
    
    // Store language in locals for use in components
    context.locals.language = languageCode;
    context.locals.isRTL = SUPPORTED_LANGUAGES.find(l => l.code === languageCode)?.direction === 'rtl';
    
    // Continue to the page with language context
    return next();
  }
  
  // No language in URL - check for saved preference or browser language
  const cookieLanguage = context.cookies.get('preferred-language')?.value;
  const acceptLanguage = context.request.headers.get('Accept-Language');
  const browserLanguages = parseAcceptLanguage(acceptLanguage);
  
  // Priority: Cookie > Browser preference > Default
  let preferredLanguage = DEFAULT_LANGUAGE;
  
  if (cookieLanguage && isValidLanguage(cookieLanguage)) {
    preferredLanguage = cookieLanguage;
  } else if (browserLanguages.length > 0) {
    const supportedCodes = SUPPORTED_LANGUAGES.map(l => l.code);
    preferredLanguage = getBestMatchingLanguage(browserLanguages, supportedCodes, DEFAULT_LANGUAGE);
  }
  
  // If preferred language is not default, redirect to localized URL
  if (preferredLanguage !== DEFAULT_LANGUAGE) {
    const localizedUrl = `/${preferredLanguage}${pathname}`;
    return context.redirect(localizedUrl, 302);
  }
  
  // Default language - no redirect needed
  context.currentLocale = DEFAULT_LANGUAGE as any;
  context.locals.language = DEFAULT_LANGUAGE;
  context.locals.isRTL = false;
  
  return next();
});

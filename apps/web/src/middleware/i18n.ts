import { defineMiddleware } from 'astro:middleware';
import { defaultLanguage, isRtl } from '../lib/i18n/config';
import { extractLanguageFromPath } from '../lib/i18n/routing';

export const i18nMiddleware = defineMiddleware(async ({ locals, url, request }, next) => {
  // Extract language from URL path
  const language = extractLanguageFromPath(url.pathname);
  
  // Set language in locals for use in pages
  locals.language = language;
  
  // Set RTL direction
  locals.direction = isRtl(language) ? 'rtl' : 'ltr';
  
  // Get preferred language from cookie or header
  const cookieLanguage = request.headers.get('cookie')
    ?.split(';')
    .find(c => c.trim().startsWith('preferred-language='))
    ?.split('=')[1];
  
  // If no language in URL but we have a preferred language, redirect
  // (Skip for API routes and static assets)
  if (!url.pathname.startsWith('/api/') && 
      !url.pathname.startsWith('/_') && 
      !url.pathname.match(/\.[a-zA-Z0-9]+$/)) {
    
    const pathHasLanguage = url.pathname.split('/').filter(Boolean)[0];
    const supportedLanguages = ['en', 'es', 'fr', 'de', 'ja', 'ar', 'he'];
    
    if (!pathHasLanguage || !supportedLanguages.includes(pathHasLanguage)) {
      // Only redirect if we have a preferred language set
      if (cookieLanguage && supportedLanguages.includes(cookieLanguage) && cookieLanguage !== defaultLanguage) {
        const newUrl = new URL('/' + cookieLanguage + url.pathname, url.origin);
        return Response.redirect(newUrl.toString(), 302);
      }
    }
  }
  
  // Continue with the request
  const response = await next();
  
  // Set language cookie if not already set
  if (!cookieLanguage) {
    response.headers.set('Set-Cookie', `preferred-language=${language}; Path=/; Max-Age=31536000; SameSite=Lax`);
  }
  
  return response;
});

// Extend Astro.locals type
declare namespace App {
  interface Locals {
    language: string;
    direction: 'ltr' | 'rtl';
  }
}

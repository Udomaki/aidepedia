import { defaultLanguage, languages } from './config';

export function getLocalizedPath(path: string, language: string = defaultLanguage): string {
  // Remove leading slash if present
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  
  // Check if path already has a language prefix
  const pathParts = cleanPath.split('/');
  const firstPart = pathParts[0];
  
  if (Object.keys(languages).includes(firstPart)) {
    // Replace existing language prefix
    pathParts[0] = language;
    return '/' + pathParts.join('/');
  }
  
  // Add language prefix
  return '/' + language + '/' + cleanPath;
}

export function extractLanguageFromPath(path: string): string {
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  const pathParts = cleanPath.split('/');
  const firstPart = pathParts[0];
  
  if (Object.keys(languages).includes(firstPart)) {
    return firstPart;
  }
  
  return defaultLanguage;
}

export function removeLanguageFromPath(path: string): string {
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  const pathParts = cleanPath.split('/');
  const firstPart = pathParts[0];
  
  if (Object.keys(languages).includes(firstPart)) {
    // Remove language prefix
    return '/' + pathParts.slice(1).join('/');
  }
  
  return path;
}

export function getLanguageAlternates(currentPath: string): Array<{ lang: string; url: string }> {
  return Object.keys(languages).map(lang => ({
    lang,
    url: getLocalizedPath(currentPath, lang),
  }));
}

export function isLanguageSupported(language: string): boolean {
  return Object.keys(languages).includes(language);
}

// OC-121: UI Translations

import type { AstroGlobal } from 'astro';

// Translation dictionary type
type TranslationDictionary = Record<string, string | Record<string, string>>;

// English translations (default)
const enTranslations: TranslationDictionary = {
  // Navigation
  'nav.home': 'Home',
  'nav.articles': 'Articles',
  'nav.categories': 'Categories',
  'nav.about': 'About',
  'nav.settings': 'Settings',
  'nav.profile': 'Profile',
  'nav.logout': 'Logout',
  'nav.language': 'Language',
  
  // Article
  'article.readMore': 'Read More',
  'article.lastUpdated': 'Last updated',
  'article.author': 'Author',
  'article.category': 'Category',
  'article.tags': 'Tags',
  'article.share': 'Share',
  'article.translate': 'Translate',
  'article.viewIn': 'View in',
  'article.availableLanguages': 'Available Languages',
  'article.noTranslations': 'No translations available yet',
  
  // Search
  'search.placeholder': 'Search articles...',
  'search.noResults': 'No results found',
  'search.allLanguages': 'All Languages',
  'search.currentLanguage': 'Current Language',
  
  // Categories
  'categories.all': 'All Categories',
  'categories.popular': 'Popular Categories',
  
  // Language switcher
  'language.switch': 'Switch Language',
  'language.select': 'Select Language',
  'language.current': 'Current Language',
  
  // Common
  'common.loading': 'Loading...',
  'common.error': 'An error occurred',
  'common.retry': 'Retry',
  'common.cancel': 'Cancel',
  'common.save': 'Save',
  'common.delete': 'Delete',
  'common.edit': 'Edit',
  'common.submit': 'Submit',
  
  // Footer
  'footer.about': 'About AIdepedia',
  'footer.privacy': 'Privacy Policy',
  'footer.terms': 'Terms of Service',
  'footer.contact': 'Contact',
};

// Spanish translations
const esTranslations: TranslationDictionary = {
  'nav.home': 'Inicio',
  'nav.articles': 'Artículos',
  'nav.categories': 'Categorías',
  'nav.about': 'Acerca de',
  'nav.settings': 'Configuración',
  'nav.profile': 'Perfil',
  'nav.logout': 'Cerrar sesión',
  'nav.language': 'Idioma',
  
  'article.readMore': 'Leer más',
  'article.lastUpdated': 'Última actualización',
  'article.author': 'Autor',
  'article.category': 'Categoría',
  'article.tags': 'Etiquetas',
  'article.share': 'Compartir',
  'article.translate': 'Traducir',
  
  'search.placeholder': 'Buscar artículos...',
  'search.noResults': 'No se encontraron resultados',
  
  'language.switch': 'Cambiar idioma',
  'language.select': 'Seleccionar idioma',
  
  'common.loading': 'Cargando...',
  'common.error': 'Ocurrió un error',
  'common.retry': 'Reintentar',
  'common.cancel': 'Cancelar',
  'common.save': 'Guardar',
  'common.delete': 'Eliminar',
  'common.edit': 'Editar',
  'common.submit': 'Enviar',
};

// French translations
const frTranslations: TranslationDictionary = {
  'nav.home': 'Accueil',
  'nav.articles': 'Articles',
  'nav.categories': 'Catégories',
  'nav.about': 'À propos',
  'nav.settings': 'Paramètres',
  'nav.profile': 'Profil',
  'nav.logout': 'Déconnexion',
  'nav.language': 'Langue',
  
  'article.readMore': 'Lire la suite',
  'article.lastUpdated': 'Dernière mise à jour',
  'article.author': 'Auteur',
  'article.category': 'Catégorie',
  'article.tags': 'Tags',
  'article.share': 'Partager',
  'article.translate': 'Traduire',
  
  'search.placeholder': 'Rechercher des articles...',
  'search.noResults': 'Aucun résultat trouvé',
  
  'language.switch': 'Changer de langue',
  'language.select': 'Sélectionner la langue',
  
  'common.loading': 'Chargement...',
  'common.error': 'Une erreur est survenue',
  'common.retry': 'Réessayer',
  'common.cancel': 'Annuler',
  'common.save': 'Enregistrer',
  'common.delete': 'Supprimer',
  'common.edit': 'Modifier',
  'common.submit': 'Soumettre',
};

// German translations
const deTranslations: TranslationDictionary = {
  'nav.home': 'Startseite',
  'nav.articles': 'Artikel',
  'nav.categories': 'Kategorien',
  'nav.about': 'Über uns',
  'nav.settings': 'Einstellungen',
  'nav.profile': 'Profil',
  'nav.logout': 'Abmelden',
  'nav.language': 'Sprache',
  
  'article.readMore': 'Weiterlesen',
  'article.lastUpdated': 'Zuletzt aktualisiert',
  'article.author': 'Autor',
  'article.category': 'Kategorie',
  'article.tags': 'Tags',
  'article.share': 'Teilen',
  'article.translate': 'Übersetzen',
  
  'search.placeholder': 'Artikel suchen...',
  'search.noResults': 'Keine Ergebnisse gefunden',
  
  'language.switch': 'Sprache wechseln',
  'language.select': 'Sprache auswählen',
  
  'common.loading': 'Laden...',
  'common.error': 'Ein Fehler ist aufgetreten',
  'common.retry': 'Erneut versuchen',
  'common.cancel': 'Abbrechen',
  'common.save': 'Speichern',
  'common.delete': 'Löschen',
  'common.edit': 'Bearbeiten',
  'common.submit': 'Absenden',
};

// Translation map
const translations: Record<string, TranslationDictionary> = {
  en: enTranslations,
  es: esTranslations,
  fr: frTranslations,
  de: deTranslations,
  // Add more languages as needed
};

/**
 * Get translation for a key in specified language
 */
export function t(key: string, languageCode: string = 'en', params?: Record<string, string>): string {
  const langTranslations = translations[languageCode] || translations.en;
  let value = langTranslations[key] || translations.en[key] || key;
  
  // Replace parameters if provided
  if (params) {
    Object.entries(params).forEach(([paramKey, paramValue]) => {
      value = value.replace(new RegExp(`{${paramKey}}`, 'g'), paramValue);
    });
  }
  
  return value;
}

/**
 * Get all translations for a language
 */
export function getTranslations(languageCode: string): TranslationDictionary {
  return translations[languageCode] || translations.en;
}

/**
 * Create translation function for Astro component
 */
export function createTranslator(languageCode: string) {
  return (key: string, params?: Record<string, string>) => t(key, languageCode, params);
}

/**
 * Get translation function from Astro context
 */
export function getTranslator(Astro: AstroGlobal) {
  const languageCode = Astro.currentLocale?.toString() || 'en';
  return createTranslator(languageCode);
}

import type { AstroGlobal } from 'astro';

// Translation API configuration
interface TranslationConfig {
  provider: 'deepl' | 'google' | 'libretranslate' | 'mock';
  apiKey?: string;
  endpoint?: string;
}

// Default configuration - can be overridden via environment variables
const getTranslationConfig = (): TranslationConfig => {
  const provider = (import.meta.env.TRANSLATION_PROVIDER || 'mock') as TranslationConfig['provider'];
  const apiKey = import.meta.env.TRANSLATION_API_KEY;
  const endpoint = import.meta.env.TRANSLATION_ENDPOINT;
  
  return { provider, apiKey, endpoint };
};

// Translation response type
export interface TranslationResult {
  translatedText: string;
  sourceLanguage: string;
  targetLanguage: string;
  provider: string;
}

// Mock translation for development/testing
const mockTranslate = async (
  text: string,
  sourceLang: string,
  targetLang: string
): Promise<TranslationResult> => {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 500));
  
  return {
    translatedText: `[${targetLang.toUpperCase()}] ${text}`,
    sourceLanguage: sourceLang,
    targetLanguage: targetLang,
    provider: 'mock',
  };
};

// DeepL translation
const deeplTranslate = async (
  text: string,
  sourceLang: string,
  targetLang: string,
  apiKey: string,
  endpoint: string = 'https://api-free.deepl.com/v2/translate'
): Promise<TranslationResult> => {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `DeepL-Auth-Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: [text],
      source_lang: sourceLang.toUpperCase(),
      target_lang: targetLang.toUpperCase(),
    }),
  });

  if (!response.ok) {
    throw new Error(`DeepL API error: ${response.status}`);
  }

  const data = await response.json();
  
  return {
    translatedText: data.translations[0].text,
    sourceLanguage: sourceLang,
    targetLanguage: targetLang,
    provider: 'deepl',
  };
};

// Google Translate API
const googleTranslate = async (
  text: string,
  sourceLang: string,
  targetLang: string,
  apiKey: string
): Promise<TranslationResult> => {
  const endpoint = `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`;
  
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      q: text,
      source: sourceLang,
      target: targetLang,
      format: 'text',
    }),
  });

  if (!response.ok) {
    throw new Error(`Google Translate API error: ${response.status}`);
  }

  const data = await response.json();
  
  return {
    translatedText: data.data.translations[0].translatedText,
    sourceLanguage: sourceLang,
    targetLanguage: targetLang,
    provider: 'google',
  };
};

// LibreTranslate API
const libreTranslate = async (
  text: string,
  sourceLang: string,
  targetLang: string,
  endpoint: string = 'https://libretranslate.de/translate',
  apiKey?: string
): Promise<TranslationResult> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  if (apiKey) {
    headers['Authorization'] = apiKey;
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      q: text,
      source: sourceLang,
      target: targetLang,
      format: 'text',
    }),
  });

  if (!response.ok) {
    throw new Error(`LibreTranslate API error: ${response.status}`);
  }

  const data = await response.json();
  
  return {
    translatedText: data.translatedText,
    sourceLanguage: sourceLang,
    targetLanguage: targetLang,
    provider: 'libretranslate',
  };
};

// Main translation function
export async function translateText(
  text: string,
  sourceLang: string,
  targetLang: string,
  config?: Partial<TranslationConfig>
): Promise<TranslationResult> {
  const finalConfig = { ...getTranslationConfig(), ...config };
  
  // Don't translate if source and target are the same
  if (sourceLang === targetLang) {
    return {
      translatedText: text,
      sourceLanguage: sourceLang,
      targetLanguage: targetLang,
      provider: 'none',
    };
  }

  switch (finalConfig.provider) {
    case 'deepl':
      if (!finalConfig.apiKey) {
        throw new Error('DeepL API key required');
      }
      return deeplTranslate(text, sourceLang, targetLang, finalConfig.apiKey, finalConfig.endpoint);
    
    case 'google':
      if (!finalConfig.apiKey) {
        throw new Error('Google Translate API key required');
      }
      return googleTranslate(text, sourceLang, targetLang, finalConfig.apiKey);
    
    case 'libretranslate':
      return libreTranslate(text, sourceLang, targetLang, finalConfig.endpoint, finalConfig.apiKey);
    
    case 'mock':
    default:
      return mockTranslate(text, sourceLang, targetLang);
  }
}

// Batch translation for multiple texts
export async function translateBatch(
  texts: string[],
  sourceLang: string,
  targetLang: string,
  config?: Partial<TranslationConfig>
): Promise<TranslationResult[]> {
  // For now, translate one by one
  // Could be optimized with API-specific batch endpoints
  return Promise.all(
    texts.map(text => translateText(text, sourceLang, targetLang, config))
  );
}

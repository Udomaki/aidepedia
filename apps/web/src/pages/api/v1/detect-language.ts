import type { APIRoute } from 'astro';
import { detectLanguage } from '../../../lib/i18n/language-detector';

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { text } = body;

    if (!text || typeof text !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Text is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const detectedLanguage = detectLanguage(text);

    return new Response(
      JSON.stringify({
        language: detectedLanguage,
        confidence: 'high', // Could be enhanced with actual confidence scoring
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Language detection error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to detect language' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

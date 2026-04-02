import type { APIRoute } from 'astro';
import { listArticles, getCategories } from '@aidepedia/db';
import { 
  successResponse, 
  errorResponse, 
  handleCors
} from '../../../lib/api-utils';

/**
 * GET /api/v1/autocomplete
 * Get autocomplete suggestions and "did you mean" suggestions
 * 
 * Query params:
 * - q: Search query (required, min 2 chars)
 * - limit: Max suggestions (default: 5, max: 10)
 */
export const GET: APIRoute = async ({ url }) => {
  try {
    const query = url.searchParams.get('q');
    const limit = Math.min(10, Math.max(1, parseInt(url.searchParams.get('limit') || '5')));
    
    if (!query || query.trim().length < 2) {
      return successResponse({
        suggestions: [],
        didYouMean: null
      });
    }

    const searchQuery = query.trim();

    // Get article suggestions
    const result = await listArticles({
      status: 'published',
      search: searchQuery,
      limit,
      sortBy: 'quality',
      sortOrder: 'desc'
    });

    // Get categories for context
    const categories = await getCategories();

    // Extract unique words from article titles for "did you mean"
    const titleWords = new Set<string>();
    result.data.forEach(article => {
      article.title.split(/\s+/).forEach(word => {
        if (word.length > 3) {
          titleWords.add(word.toLowerCase());
        }
      });
    });

    // Simple "did you mean" - check if query words are similar to title words
    const queryWords = searchQuery.toLowerCase().split(/\s+/);
    let didYouMean: string | null = null;
    
    for (const queryWord of queryWords) {
      if (queryWord.length < 4) continue;
      
      // Find similar words
      const similarWord = Array.from(titleWords).find(titleWord => {
        return levenshteinDistance(queryWord, titleWord) <= 2;
      });
      
      if (similarWord && similarWord !== queryWord) {
        didYouMean = searchQuery.replace(new RegExp(queryWord, 'i'), similarWord);
        break;
      }
    }

    const suggestions = result.data.map(article => ({
      id: article.id,
      slug: article.slug,
      title: article.title,
      excerpt: article.excerpt,
      category: article.categoryId ? categories.find(c => c.id === article.categoryId)?.name : undefined,
      qualityScore: article.qualityScore
    }));

    return successResponse({
      suggestions,
      didYouMean,
      query: searchQuery
    });
  } catch (error) {
    console.error('Error getting autocomplete suggestions:', error);
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to get suggestions',
      500
    );
  }
};

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Handle OPTIONS for CORS preflight
 */
export const OPTIONS: APIRoute = async () => {
  return handleCors();
};

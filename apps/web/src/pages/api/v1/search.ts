import type { APIRoute } from 'astro';
import { 
  listArticles, 
  getCategories 
} from '@aidepedia/db';
import { 
  successResponse, 
  errorResponse, 
  handleCors,
  getPaginationParams,
  transformArticleForApi
} from '../../../lib/api-utils';

/**
 * GET /api/v1/search
 * Search articles by query
 * 
 * Query params:
 * - q: Search query (required)
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 20, max: 100)
 * - category: Filter by category ID
 * 
 * Searches in article titles and content
 */
export const GET: APIRoute = async ({ url }) => {
  try {
    const query = url.searchParams.get('q');
    
    if (!query || query.trim().length === 0) {
      return errorResponse('VALIDATION_ERROR', 'Search query (q) is required', 400);
    }

    const { page, limit } = getPaginationParams(url);
    const categoryId = url.searchParams.get('category');

    // Build query params
    const params: any = {
      status: 'published',
      search: query.trim(),
      page,
      limit,
      sortBy: 'quality',
      sortOrder: 'desc',
    };

    if (categoryId) {
      params.categoryId = parseInt(categoryId, 10);
      if (isNaN(params.categoryId)) {
        return errorResponse('VALIDATION_ERROR', 'Invalid category ID', 400);
      }
    }

    // Search articles
    const result = await listArticles(params);

    // Fetch categories for lookup
    const categories = await getCategories();
    const categoryMap = new Map(categories.map(c => [c.id, c.name]));

    // Transform articles for API
    const articles = result.data.map(article => 
      transformArticleForApi(article, article.categoryId ? categoryMap.get(article.categoryId) : undefined)
    );

    return successResponse({
      query: query.trim(),
      results: articles,
    }, {
      total: result.meta.total,
      page: result.meta.page,
      limit: result.meta.limit,
      totalPages: result.meta.totalPages,
    });
  } catch (error) {
    console.error('Error searching articles:', error);
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to search articles',
      500
    );
  }
};

/**
 * Handle OPTIONS for CORS preflight
 */
export const OPTIONS: APIRoute = async () => {
  return handleCors();
};

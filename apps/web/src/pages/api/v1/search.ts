import type { APIRoute } from 'astro';
import { 
  listArticles, 
  getCategories,
  getCategoryBySlug
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
 * - category: Filter by category slug
 * - dateFrom: Filter by date (ISO string or 'today', 'week', 'month', 'year')
 * - dateTo: Filter by date (ISO string)
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
    const categorySlug = url.searchParams.get('category');
    const dateFilter = url.searchParams.get('dateFrom') || url.searchParams.get('date');

    // Build query params
    const params: any = {
      status: 'published',
      search: query.trim(),
      page,
      limit,
      sortBy: 'quality',
      sortOrder: 'desc',
    };

    // Handle category filter (by slug)
    if (categorySlug) {
      try {
        const category = await getCategoryBySlug(categorySlug);
        params.categoryId = category.id;
      } catch (error) {
        // Category not found, return empty results
        return successResponse({
          query: query.trim(),
          results: [],
        }, {
          total: 0,
          page,
          limit,
          totalPages: 0,
        });
      }
    }

    // Handle date filter
    if (dateFilter) {
      const now = new Date();
      let dateFrom: Date | undefined;
      
      switch (dateFilter) {
        case 'today':
          dateFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case 'week':
          dateFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          dateFrom = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
          break;
        case 'year':
          dateFrom = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
          break;
        default:
          // Try to parse as ISO date
          dateFrom = new Date(dateFilter);
          if (isNaN(dateFrom.getTime())) {
            dateFrom = undefined;
          }
      }
      
      if (dateFrom) {
        params.dateFrom = dateFrom.toISOString();
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

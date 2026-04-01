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
} from '../../../../lib/api-utils';

/**
 * GET /api/v1/articles
 * List published articles with pagination and filtering
 * 
 * Query params:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 20, max: 100)
 * - category: Filter by category ID
 * - tag: Filter by tag
 * - sort: Sort by (date, title, views, quality)
 * - order: Sort order (asc, desc)
 */
export const GET: APIRoute = async ({ url }) => {
  try {
    const { page, limit } = getPaginationParams(url);
    const categoryId = url.searchParams.get('category');
    const tag = url.searchParams.get('tag');
    const sort = url.searchParams.get('sort') as 'date' | 'title' | 'views' | 'quality' | null;
    const order = url.searchParams.get('order') as 'asc' | 'desc' | null;

    // Build query params
    const params: any = {
      status: 'published',
      page,
      limit,
    };

    if (categoryId) {
      params.categoryId = parseInt(categoryId, 10);
      if (isNaN(params.categoryId)) {
        return errorResponse('VALIDATION_ERROR', 'Invalid category ID', 400);
      }
    }

    if (tag) {
      params.tags = [tag];
    }

    if (sort && ['date', 'title', 'views', 'quality'].includes(sort)) {
      params.sortBy = sort;
    }

    if (order && ['asc', 'desc'].includes(order)) {
      params.sortOrder = order;
    }

    // Fetch articles
    const result = await listArticles(params);

    // Fetch categories for lookup
    const categories = await getCategories();
    const categoryMap = new Map(categories.map(c => [c.id, c.name]));

    // Transform articles for API
    const articles = result.data.map(article => 
      transformArticleForApi(article, article.categoryId ? categoryMap.get(article.categoryId) : undefined)
    );

    return successResponse(articles, {
      total: result.meta.total,
      page: result.meta.page,
      limit: result.meta.limit,
      totalPages: result.meta.totalPages,
    });
  } catch (error) {
    console.error('Error fetching articles:', error);
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to fetch articles',
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

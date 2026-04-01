import type { APIRoute } from 'astro';
import { 
  listArticles, 
  getCategories,
  createArticle 
} from '@aidepedia/db';
import { 
  successResponse, 
  errorResponse, 
  handleCors,
  getPaginationParams,
  transformArticleForApi
} from '../../../../lib/api-utils';
import { getSession } from '../../../../lib/auth';

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
 * POST /api/v1/articles
 * Create a new article
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    // Check authentication
    const session = await getSession(request);
    if (!session?.user?.id) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    }

    // Parse request body
    const body = await request.json();
    const { title, content, excerpt, slug, categoryId, status, tags } = body;

    // Validate required fields
    if (!title || !content) {
      return errorResponse('VALIDATION_ERROR', 'Title and content are required', 400);
    }

    if (!slug) {
      return errorResponse('VALIDATION_ERROR', 'Slug is required', 400);
    }

    // Create article
    // Note: For now, we'll use the user ID as the editor ID
    // In a real system, you might need to map users to editors
    const editorId = parseInt(session.user.id as string, 10);
    
    const article = await createArticle(
      {
        title,
        content,
        excerpt,
        slug,
        categoryId: categoryId || null,
        status: status || 'draft',
        tags: tags || [],
      },
      editorId,
      'Created via web interface'
    );

    return successResponse(article, null, 201);
  } catch (error) {
    console.error('Error creating article:', error);
    
    // Check for validation errors
    if (error instanceof Error && error.message.includes('already exists')) {
      return errorResponse('VALIDATION_ERROR', error.message, 400);
    }
    
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to create article',
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

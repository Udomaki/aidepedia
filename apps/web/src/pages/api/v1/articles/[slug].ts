import type { APIRoute } from 'astro';
import { 
  getArticleBySlug, 
  getCategories 
} from '@aidepedia/db';
import { 
  successResponse, 
  errorResponse, 
  handleCors,
  transformArticleForApi
} from '../../../../lib/api-utils';

/**
 * GET /api/v1/articles/[slug]
 * Get a single article by slug
 * 
 * Returns full article details including content
 */
export const GET: APIRoute = async ({ params }) => {
  try {
    const { slug } = params;

    if (!slug) {
      return errorResponse('VALIDATION_ERROR', 'Slug is required', 400);
    }

    // Fetch article
    const article = await getArticleBySlug(slug);

    // Only return published articles via public API
    if (article.status !== 'published') {
      return errorResponse('NOT_FOUND', 'Article not found', 404);
    }

    // Fetch category name if available
    let categoryName: string | undefined;
    if (article.categoryId) {
      const categories = await getCategories();
      categoryName = categories.find(c => c.id === article.categoryId)?.name;
    }

    // Transform for API
    const articleData = transformArticleForApi(article, categoryName);

    return successResponse(articleData);
  } catch (error) {
    console.error('Error fetching article:', error);
    
    // Check if it's a not found error
    if (error instanceof Error && error.message.includes('not found')) {
      return errorResponse('NOT_FOUND', 'Article not found', 404);
    }
    
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to fetch article',
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

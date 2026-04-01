import type { APIRoute } from 'astro';
import { 
  getArticleBySlug, 
  getArticleRevisions 
} from '@aidepedia/db';
import { 
  successResponse, 
  errorResponse, 
  handleCors
} from '../../../../../../lib/api-utils';

/**
 * GET /api/v1/articles/[slug]/revisions
 * Get all revisions for an article
 * 
 * Query params:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 20, max: 100)
 */
export const GET: APIRoute = async ({ params, url }) => {
  try {
    const { slug } = params;

    if (!slug) {
      return errorResponse('VALIDATION_ERROR', 'Slug is required', 400);
    }

    // Get pagination params
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const limit = Math.min(100, parseInt(url.searchParams.get('limit') || '20', 10));

    // Fetch article
    const article = await getArticleBySlug(slug);

    // Fetch revisions
    const result = await getArticleRevisions(article.id, { page, limit });

    // Transform for API
    const revisionsData = result.data.map(revision => ({
      id: revision.id,
      articleId: revision.articleId,
      editorId: revision.editorId,
      title: revision.title,
      excerpt: revision.excerpt,
      categoryId: revision.categoryId,
      tags: revision.tags,
      changeReason: revision.changeReason,
      changeType: revision.changeType,
      upvotes: revision.upvotes,
      downvotes: revision.downvotes,
      createdAt: revision.createdAt?.toISOString(),
    }));

    return successResponse({
      revisions: revisionsData,
      pagination: result.meta,
    });
  } catch (error) {
    console.error('Error fetching revisions:', error);
    
    // Check if it's a not found error
    if (error instanceof Error && error.message.includes('not found')) {
      return errorResponse('NOT_FOUND', 'Article not found', 404);
    }
    
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to fetch revisions',
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

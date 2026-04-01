import type { APIRoute } from 'astro';
import { 
  getArticleBySlug, 
  getRevisionById 
} from '@aidepedia/db';
import { 
  successResponse, 
  errorResponse, 
  handleCors
} from '../../../../../../lib/api-utils';

/**
 * GET /api/v1/articles/[slug]/revisions/[id]
 * Get a specific revision by ID
 */
export const GET: APIRoute = async ({ params }) => {
  try {
    const { slug, id } = params;

    if (!slug || !id) {
      return errorResponse('VALIDATION_ERROR', 'Slug and revision ID are required', 400);
    }

    const revisionId = parseInt(id, 10);
    if (isNaN(revisionId)) {
      return errorResponse('VALIDATION_ERROR', 'Invalid revision ID', 400);
    }

    // Fetch article
    const article = await getArticleBySlug(slug);

    // Fetch revision
    const revision = await getRevisionById(revisionId);

    // Verify this revision belongs to this article
    if (revision.articleId !== article.id) {
      return errorResponse('NOT_FOUND', 'Revision not found for this article', 404);
    }

    // Transform for API
    const revisionData = {
      id: revision.id,
      articleId: revision.articleId,
      editorId: revision.editorId,
      title: revision.title,
      content: revision.content,
      excerpt: revision.excerpt,
      categoryId: revision.categoryId,
      tags: revision.tags,
      changeReason: revision.changeReason,
      changeType: revision.changeType,
      upvotes: revision.upvotes,
      downvotes: revision.downvotes,
      createdAt: revision.createdAt?.toISOString(),
    };

    return successResponse(revisionData);
  } catch (error) {
    console.error('Error fetching revision:', error);
    
    // Check if it's a not found error
    if (error instanceof Error && error.message.includes('not found')) {
      return errorResponse('NOT_FOUND', 'Article or revision not found', 404);
    }
    
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to fetch revision',
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

import type { APIRoute } from 'astro';
import { getSession } from '../../../../../lib/auth';
import { 
  getArticleBySlug,
  toggleBookmark,
  NotFoundError
} from '@aidepedia/db';
import { 
  successResponse, 
  errorResponse, 
  handleCors 
} from '../../../../../lib/api-utils';

/**
 * POST /api/v1/articles/[slug]/bookmark
 * Toggle bookmark for an article (add if not bookmarked, remove if bookmarked)
 */
export const POST: APIRoute = async ({ params, request }) => {
  try {
    const session = await getSession(request);
    
    if (!session?.user?.id) {
      return errorResponse('UNAUTHORIZED', 'You must be logged in', 401);
    }

    const { slug } = params;

    if (!slug) {
      return errorResponse('VALIDATION_ERROR', 'Slug is required', 400);
    }

    // Fetch article to get its ID
    const article = await getArticleBySlug(slug);

    // Toggle bookmark
    const result = await toggleBookmark(
      parseInt(session.user.id as string),
      article.id
    );

    return successResponse({
      bookmarked: result.bookmarked,
      message: result.bookmarked ? 'Article bookmarked' : 'Bookmark removed'
    });
  } catch (error) {
    console.error('Error toggling bookmark:', error);
    
    if (error instanceof NotFoundError) {
      return errorResponse('NOT_FOUND', 'Article not found', 404);
    }
    
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to toggle bookmark',
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

import type { APIRoute } from 'astro';
import { getSession } from '../../../../../../lib/auth';
import { 
  getArticleBySlug,
  removeArticleReaction,
  getArticleReactionCounts,
  NotFoundError
} from '@aidepedia/db';
import { 
  successResponse, 
  errorResponse, 
  handleCors 
} from '../../../../../../lib/api-utils';

/**
 * DELETE /api/v1/articles/[slug]/reactions/[emoji]
 * Remove a specific reaction
 */
export const DELETE: APIRoute = async ({ params, request }) => {
  try {
    const session = await getSession(request);
    
    if (!session?.user?.id) {
      return errorResponse('UNAUTHORIZED', 'You must be logged in', 401);
    }

    const { slug, emoji } = params;

    if (!slug) {
      return errorResponse('VALIDATION_ERROR', 'Slug is required', 400);
    }

    if (!emoji) {
      return errorResponse('VALIDATION_ERROR', 'Emoji is required', 400);
    }

    // Decode emoji from URL
    const decodedEmoji = decodeURIComponent(emoji);

    // Fetch article
    const article = await getArticleBySlug(slug);

    // Remove reaction
    await removeArticleReaction(
      article.id,
      parseInt(session.user.id as string),
      decodedEmoji
    );

    // Get updated counts
    const counts = await getArticleReactionCounts(article.id);

    return successResponse({
      counts,
      message: 'Reaction removed'
    });
  } catch (error) {
    console.error('Error removing reaction:', error);
    
    if (error instanceof NotFoundError) {
      return errorResponse('NOT_FOUND', 'Article not found', 404);
    }
    
    if (error instanceof Error && error.message.includes('Reaction not found')) {
      return errorResponse('NOT_FOUND', 'Reaction not found', 404);
    }
    
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to remove reaction',
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

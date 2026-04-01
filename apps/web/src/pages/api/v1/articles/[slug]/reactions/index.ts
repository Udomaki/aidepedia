import type { APIRoute } from 'astro';
import { getSession } from '../../../../../../lib/auth';
import { 
  getArticleBySlug,
  getArticleReactionCounts,
  getUserArticleReactions,
  toggleArticleReaction,
  NotFoundError
} from '@aidepedia/db';
import { 
  successResponse, 
  errorResponse, 
  handleCors 
} from '../../../../../../lib/api-utils';

/**
 * GET /api/v1/articles/[slug]/reactions
 * Get reaction counts for an article
 */
export const GET: APIRoute = async ({ params, request }) => {
  try {
    const { slug } = params;

    if (!slug) {
      return errorResponse('VALIDATION_ERROR', 'Slug is required', 400);
    }

    // Fetch article
    const article = await getArticleBySlug(slug);

    // Get reaction counts
    const counts = await getArticleReactionCounts(article.id);

    // Get user's reactions if authenticated
    const session = await getSession(request);
    let userReactions: string[] = [];
    
    if (session?.user?.id) {
      userReactions = await getUserArticleReactions(
        article.id,
        parseInt(session.user.id as string)
      );
    }

    return successResponse({
      counts,
      userReactions,
    });
  } catch (error) {
    console.error('Error fetching reactions:', error);
    
    if (error instanceof NotFoundError) {
      return errorResponse('NOT_FOUND', 'Article not found', 404);
    }
    
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to fetch reactions',
      500
    );
  }
};

/**
 * POST /api/v1/articles/[slug]/reactions
 * Toggle a reaction (add if not exists, remove if exists)
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

    // Parse request body
    const body = await request.json();
    const { emoji } = body;

    if (!emoji) {
      return errorResponse('VALIDATION_ERROR', 'Emoji is required', 400);
    }

    // Fetch article
    const article = await getArticleBySlug(slug);

    // Toggle reaction
    const result = await toggleArticleReaction(
      article.id,
      parseInt(session.user.id as string),
      emoji
    );

    // Get updated counts
    const counts = await getArticleReactionCounts(article.id);

    return successResponse({
      reacted: result.reacted,
      counts,
      message: result.reacted ? 'Reaction added' : 'Reaction removed'
    });
  } catch (error) {
    console.error('Error toggling reaction:', error);
    
    if (error instanceof NotFoundError) {
      return errorResponse('NOT_FOUND', 'Article not found', 404);
    }
    
    if (error instanceof Error && error.message.includes('Invalid reaction emoji')) {
      return errorResponse('VALIDATION_ERROR', 'Invalid reaction emoji', 400);
    }
    
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to toggle reaction',
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

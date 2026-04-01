import type { APIRoute } from 'astro';
import { getSession } from '../../../../../lib/auth';
import {
  getArticleBySlug,
  submitArticleWorkflowVote,
  getArticleWorkflowVote,
  getArticleVoteStats,
  NotFoundError,
  ValidationError
} from '@aidepedia/db';
import {
  successResponse,
  errorResponse,
  handleCors
} from '../../../../../lib/api-utils';

/**
 * POST /api/v1/articles/[slug]/vote
 * Submit or update an article workflow vote (approve/reject/neutral with rating and comment)
 * 
 * Body: {
 *   vote: 'approve' | 'reject' | 'neutral',
 *   qualityRating?: number (1-5),
 *   comment?: string
 * }
 */
export const POST: APIRoute = async ({ params, request }) => {
  try {
    const session = await getSession(request);

    if (!session?.user?.id) {
      return errorResponse('UNAUTHORIZED', 'You must be logged in to vote', 401);
    }

    const { slug } = params;

    if (!slug) {
      return errorResponse('VALIDATION_ERROR', 'Slug is required', 400);
    }

    // Parse request body
    const body = await request.json();
    const { vote, qualityRating, comment } = body;

    // Validate vote type
    if (!vote || !['approve', 'reject', 'neutral'].includes(vote)) {
      return errorResponse('VALIDATION_ERROR', 'Vote must be "approve", "reject", or "neutral"', 400);
    }

    // Validate quality rating if provided
    if (qualityRating !== undefined && qualityRating !== null) {
      const rating = Number(qualityRating);
      if (isNaN(rating) || rating < 1 || rating > 5) {
        return errorResponse('VALIDATION_ERROR', 'Quality rating must be between 1 and 5', 400);
      }
    }

    // Validate comment length
    if (comment && comment.length > 1000) {
      return errorResponse('VALIDATION_ERROR', 'Comment must be 1000 characters or less', 400);
    }

    // Fetch article to get its ID
    const article = await getArticleBySlug(slug);

    // Submit or update vote
    const result = await submitArticleWorkflowVote(
      article.id,
      parseInt(session.user.id as string),
      vote,
      qualityRating ? Number(qualityRating) : undefined,
      comment
    );

    // Get updated stats
    const stats = await getArticleVoteStats(article.id);

    return successResponse({
      vote: result,
      stats,
      message: 'Vote submitted successfully'
    });
  } catch (error) {
    console.error('Error submitting vote:', error);

    if (error instanceof NotFoundError) {
      return errorResponse('NOT_FOUND', 'Article not found', 404);
    }

    if (error instanceof ValidationError) {
      return errorResponse('VALIDATION_ERROR', error.message, 400);
    }

    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to submit vote',
      500
    );
  }
};

/**
 * GET /api/v1/articles/[slug]/vote
 * Get current user's vote and overall vote statistics for an article
 */
export const GET: APIRoute = async ({ params, request }) => {
  try {
    const session = await getSession(request);
    const { slug } = params;

    if (!slug) {
      return errorResponse('VALIDATION_ERROR', 'Slug is required', 400);
    }

    // Fetch article to get its ID
    const article = await getArticleBySlug(slug);

    // Get vote statistics
    const stats = await getArticleVoteStats(article.id);

    // Get user's vote if logged in
    let userVote = null;
    if (session?.user?.id) {
      userVote = await getArticleWorkflowVote(
        article.id,
        parseInt(session.user.id as string)
      );
    }

    return successResponse({
      stats,
      userVote
    });
  } catch (error) {
    console.error('Error getting vote:', error);

    if (error instanceof NotFoundError) {
      return errorResponse('NOT_FOUND', 'Article not found', 404);
    }

    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to get vote information',
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

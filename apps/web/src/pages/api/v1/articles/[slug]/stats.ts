import type { APIRoute } from 'astro';
import { getSession } from '../../../../../lib/auth';
import { getArticleBySlug, getArticleStats, NotFoundError } from '@aidepedia/db';
import { successResponse, errorResponse, handleCors } from '../../../../../lib/api-utils';

/**
 * GET /api/v1/articles/[slug]/stats
 * Get statistics for a specific article
 * Only the article author can view stats
 */
export const GET: APIRoute = async ({ params, request }) => {
  try {
    const { slug } = params;

    if (!slug) {
      return errorResponse('VALIDATION_ERROR', 'Article slug is required', 400);
    }

    // Check authentication
    const session = await getSession(request);
    if (!session?.user?.id) {
      return errorResponse('UNAUTHORIZED', 'You must be logged in to view stats', 401);
    }

    // Get article
    const article = await getArticleBySlug(slug);

    // Check if user is the author
    if (article.authorId !== parseInt(session.user.id as string)) {
      return errorResponse('FORBIDDEN', 'Only the article author can view stats', 403);
    }

    // Get query params for time range
    const url = new URL(request.url);
    const days = parseInt(url.searchParams.get('days') || '30');

    // Validate days parameter
    if (isNaN(days) || days < 1 || days > 365) {
      return errorResponse('VALIDATION_ERROR', 'Days must be between 1 and 365', 400);
    }

    // Get article stats
    const stats = await getArticleStats(article.id, days);

    return successResponse({
      articleId: article.id,
      slug: article.slug,
      title: article.title,
      period: {
        days,
        from: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString(),
        to: new Date().toISOString(),
      },
      stats,
    });
  } catch (error) {
    console.error('Error fetching article stats:', error);

    if (error instanceof NotFoundError) {
      return errorResponse('NOT_FOUND', 'Article not found', 404);
    }

    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to fetch article stats',
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

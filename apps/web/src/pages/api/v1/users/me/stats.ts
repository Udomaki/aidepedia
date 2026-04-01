import type { APIRoute } from 'astro';
import { getSession } from '../../../../../lib/auth';
import { getAuthorStats, NotFoundError } from '@aidepedia/db';
import { successResponse, errorResponse, handleCors } from '../../../../../lib/api-utils';

/**
 * GET /api/v1/users/me/stats
 * Get overall statistics for the current user (author)
 */
export const GET: APIRoute = async ({ request }) => {
  try {
    // Check authentication
    const session = await getSession(request);
    if (!session?.user?.id) {
      return errorResponse('UNAUTHORIZED', 'You must be logged in to view stats', 401);
    }

    // Get query params for time range
    const url = new URL(request.url);
    const days = parseInt(url.searchParams.get('days') || '30');

    // Validate days parameter
    if (isNaN(days) || days < 1 || days > 365) {
      return errorResponse('VALIDATION_ERROR', 'Days must be between 1 and 365', 400);
    }

    // Get author stats
    const stats = await getAuthorStats(parseInt(session.user.id as string), days);

    return successResponse({
      period: {
        days,
        from: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString(),
        to: new Date().toISOString(),
      },
      stats,
    });
  } catch (error) {
    console.error('Error fetching author stats:', error);

    if (error instanceof NotFoundError) {
      return errorResponse('NOT_FOUND', 'User not found', 404);
    }

    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to fetch author stats',
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

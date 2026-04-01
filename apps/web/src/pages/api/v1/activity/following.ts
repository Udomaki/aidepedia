import type { APIRoute } from 'astro';
import { getSession } from '../../../../lib/auth';
import { getFollowingActivityFeed } from '@aidepedia/db';
import { 
  successResponse, 
  errorResponse, 
  handleCors 
} from '../../../../lib/api-utils';

/**
 * GET /api/v1/activity/following
 * Get activity feed from followed users
 */
export const GET: APIRoute = async ({ url, request }) => {
  try {
    const session = await getSession(request);
    
    if (!session?.user?.id) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    }

    // Parse pagination params
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const limit = parseInt(url.searchParams.get('limit') || '20', 10);

    // Get activity feed
    const result = await getFollowingActivityFeed(session.user.id, { page, limit });

    return successResponse(result);
  } catch (error) {
    console.error('Error fetching activity feed:', error);
    
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to fetch activity feed',
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

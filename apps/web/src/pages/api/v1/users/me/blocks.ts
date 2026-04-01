import type { APIRoute } from 'astro';
import { getSession } from '../../../../../lib/auth';
import { getBlockedUsers } from '@aidepedia/db';
import { 
  successResponse, 
  errorResponse, 
  handleCors 
} from '../../../../../lib/api-utils';

/**
 * GET /api/v1/users/me/blocks
 * List users blocked by the current user
 */
export const GET: APIRoute = async ({ request, url }) => {
  try {
    const session = await getSession(request);
    
    if (!session?.user?.id) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    }

    // Parse pagination params
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const limit = parseInt(url.searchParams.get('limit') || '20', 10);

    // Get blocked users
    const result = await getBlockedUsers(session.user.id, { page, limit });

    return successResponse(result);
  } catch (error) {
    console.error('Error fetching blocked users:', error);
    
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to fetch blocked users',
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

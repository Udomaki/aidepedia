import type { APIRoute } from 'astro';
import { 
  getUserByUsername,
  getFollowers,
  NotFoundError
} from '@aidepedia/db';
import { 
  successResponse, 
  errorResponse, 
  handleCors 
} from '../../../../../lib/api-utils';

/**
 * GET /api/v1/users/[username]/followers
 * List followers of a user
 */
export const GET: APIRoute = async ({ params, url }) => {
  try {
    const { username } = params;

    if (!username) {
      return errorResponse('VALIDATION_ERROR', 'Username is required', 400);
    }

    // Get user
    const user = await getUserByUsername(username);

    // Parse pagination params
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const limit = parseInt(url.searchParams.get('limit') || '20', 10);

    // Get followers
    const result = await getFollowers(user.id, { page, limit });

    return successResponse(result);
  } catch (error) {
    console.error('Error fetching followers:', error);
    
    if (error instanceof NotFoundError) {
      return errorResponse('NOT_FOUND', 'User not found', 404);
    }
    
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to fetch followers',
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

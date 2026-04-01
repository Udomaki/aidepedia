import type { APIRoute } from 'astro';
import { getSession } from '../../../../../lib/auth';
import { 
  getUserByUsername,
  followUser,
  unfollowUser,
  isFollowing,
  NotFoundError,
  ValidationError
} from '@aidepedia/db';
import { 
  successResponse, 
  errorResponse, 
  handleCors 
} from '../../../../../lib/api-utils';

/**
 * POST /api/v1/users/[username]/follow
 * Follow a user
 */
export const POST: APIRoute = async ({ params, request }) => {
  try {
    const session = await getSession(request);
    
    if (!session?.user?.id) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    }

    const { username } = params;

    if (!username) {
      return errorResponse('VALIDATION_ERROR', 'Username is required', 400);
    }

    // Get user to follow
    const userToFollow = await getUserByUsername(username);

    // Follow the user
    await followUser(session.user.id, userToFollow.id);

    return successResponse({ 
      message: 'Successfully followed user',
      following: true 
    });
  } catch (error) {
    console.error('Error following user:', error);
    
    if (error instanceof NotFoundError) {
      return errorResponse('NOT_FOUND', 'User not found', 404);
    }

    if (error instanceof ValidationError) {
      return errorResponse('VALIDATION_ERROR', error.message, 400);
    }
    
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to follow user',
      500
    );
  }
};

/**
 * DELETE /api/v1/users/[username]/follow
 * Unfollow a user
 */
export const DELETE: APIRoute = async ({ params, request }) => {
  try {
    const session = await getSession(request);
    
    if (!session?.user?.id) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    }

    const { username } = params;

    if (!username) {
      return errorResponse('VALIDATION_ERROR', 'Username is required', 400);
    }

    // Get user to unfollow
    const userToUnfollow = await getUserByUsername(username);

    // Unfollow the user
    await unfollowUser(session.user.id, userToUnfollow.id);

    return successResponse({ 
      message: 'Successfully unfollowed user',
      following: false 
    });
  } catch (error) {
    console.error('Error unfollowing user:', error);
    
    if (error instanceof NotFoundError) {
      return errorResponse('NOT_FOUND', 'User not found', 404);
    }

    if (error instanceof ValidationError) {
      return errorResponse('VALIDATION_ERROR', error.message, 400);
    }
    
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to unfollow user',
      500
    );
  }
};

/**
 * GET /api/v1/users/[username]/follow
 * Check if current user is following this user
 */
export const GET: APIRoute = async ({ params, request }) => {
  try {
    const session = await getSession(request);
    
    if (!session?.user?.id) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    }

    const { username } = params;

    if (!username) {
      return errorResponse('VALIDATION_ERROR', 'Username is required', 400);
    }

    // Get user
    const user = await getUserByUsername(username);

    // Check if following
    const following = await isFollowing(session.user.id, user.id);

    return successResponse({ following });
  } catch (error) {
    console.error('Error checking follow status:', error);
    
    if (error instanceof NotFoundError) {
      return errorResponse('NOT_FOUND', 'User not found', 404);
    }
    
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to check follow status',
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

import type { APIRoute } from 'astro';
import { getSession } from '../../../../../lib/auth';
import { 
  getUserByUsername,
  blockUser,
  unblockUser,
  isBlocking,
  NotFoundError,
  ValidationError
} from '@aidepedia/db';
import { 
  successResponse, 
  errorResponse, 
  handleCors 
} from '../../../../../lib/api-utils';

/**
 * POST /api/v1/users/[username]/block
 * Block a user
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

    // Get user to block
    const userToBlock = await getUserByUsername(username);

    // Block the user
    await blockUser(session.user.id, userToBlock.id);

    return successResponse({ 
      message: 'Successfully blocked user',
      blocking: true 
    });
  } catch (error) {
    console.error('Error blocking user:', error);
    
    if (error instanceof NotFoundError) {
      return errorResponse('NOT_FOUND', 'User not found', 404);
    }

    if (error instanceof ValidationError) {
      return errorResponse('VALIDATION_ERROR', error.message, 400);
    }
    
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to block user',
      500
    );
  }
};

/**
 * DELETE /api/v1/users/[username]/block
 * Unblock a user
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

    // Get user to unblock
    const userToUnblock = await getUserByUsername(username);

    // Unblock the user
    await unblockUser(session.user.id, userToUnblock.id);

    return successResponse({ 
      message: 'Successfully unblocked user',
      blocking: false 
    });
  } catch (error) {
    console.error('Error unblocking user:', error);
    
    if (error instanceof NotFoundError) {
      return errorResponse('NOT_FOUND', 'User not found', 404);
    }

    if (error instanceof ValidationError) {
      return errorResponse('VALIDATION_ERROR', error.message, 400);
    }
    
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to unblock user',
      500
    );
  }
};

/**
 * GET /api/v1/users/[username]/block
 * Check if current user is blocking this user
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

    // Check if blocking
    const blocking = await isBlocking(session.user.id, user.id);

    return successResponse({ blocking });
  } catch (error) {
    console.error('Error checking block status:', error);
    
    if (error instanceof NotFoundError) {
      return errorResponse('NOT_FOUND', 'User not found', 404);
    }
    
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to check block status',
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

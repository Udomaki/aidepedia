import type { APIRoute } from 'astro';
import { getSession } from '../../../../lib/auth';
import { 
  getUserById,
  updateUserProfile,
  NotFoundError
} from '@aidepedia/db';
import { 
  successResponse, 
  errorResponse, 
  handleCors 
} from '../../../../lib/api-utils';

/**
 * GET /api/v1/users/me
 * Get current user's profile
 */
export const GET: APIRoute = async ({ request }) => {
  try {
    const session = await getSession(request);
    
    if (!session?.user?.id) {
      return errorResponse('UNAUTHORIZED', 'You must be logged in', 401);
    }

    // Get full user data
    const user = await getUserById(parseInt(session.user.id as string));

    return successResponse({
      id: user.id,
      name: user.name,
      email: user.email,
      avatar: user.image,
      bio: user.bio,
      showActivity: user.showActivity !== false,
      showBadges: user.showBadges !== false,
      createdAt: user.createdAt?.toISOString?.() || user.createdAt,
      updatedAt: user.updatedAt?.toISOString?.() || user.updatedAt,
    });
  } catch (error) {
    console.error('Error fetching current user:', error);
    
    if (error instanceof NotFoundError) {
      return errorResponse('NOT_FOUND', 'User not found', 404);
    }
    
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to fetch user profile',
      500
    );
  }
};

/**
 * PUT /api/v1/users/me
 * Update current user's profile
 */
export const PUT: APIRoute = async ({ request }) => {
  try {
    const session = await getSession(request);
    
    if (!session?.user?.id) {
      return errorResponse('UNAUTHORIZED', 'You must be logged in', 401);
    }

    // Parse request body
    const body = await request.json();
    const { name, bio, image, showActivity, showBadges } = body;

    // Validate inputs
    if (name !== undefined && (typeof name !== 'string' || name.length === 0)) {
      return errorResponse('VALIDATION_ERROR', 'Name must be a non-empty string', 400);
    }

    if (bio !== undefined && typeof bio !== 'string') {
      return errorResponse('VALIDATION_ERROR', 'Bio must be a string', 400);
    }

    if (image !== undefined && typeof image !== 'string') {
      return errorResponse('VALIDATION_ERROR', 'Image must be a string URL', 400);
    }

    if (showActivity !== undefined && typeof showActivity !== 'boolean') {
      return errorResponse('VALIDATION_ERROR', 'showActivity must be a boolean', 400);
    }

    if (showBadges !== undefined && typeof showBadges !== 'boolean') {
      return errorResponse('VALIDATION_ERROR', 'showBadges must be a boolean', 400);
    }

    // Update user profile
    const updatedUser = await updateUserProfile(parseInt(session.user.id as string), {
      name,
      bio,
      image,
      showActivity,
      showBadges,
    });

    return successResponse({
      id: updatedUser.id,
      name: updatedUser.name,
      email: updatedUser.email,
      avatar: updatedUser.image,
      bio: updatedUser.bio,
      showActivity: updatedUser.showActivity !== false,
      showBadges: updatedUser.showBadges !== false,
      updatedAt: updatedUser.updatedAt?.toISOString?.() || updatedUser.updatedAt,
    });
  } catch (error) {
    console.error('Error updating user profile:', error);
    
    if (error instanceof NotFoundError) {
      return errorResponse('NOT_FOUND', 'User not found', 404);
    }
    
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to update user profile',
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

import type { APIRoute } from 'astro';
import { 
  getUserByUsername,
  getUserStats,
  getUserActivity,
  NotFoundError
} from '@aidepedia/db';
import { 
  successResponse, 
  errorResponse, 
  handleCors 
} from '../../../../lib/api-utils';

/**
 * GET /api/v1/users/[username]
 * Get public profile data for a user
 */
export const GET: APIRoute = async ({ params }) => {
  try {
    const { username } = params;

    if (!username) {
      return errorResponse('VALIDATION_ERROR', 'Username is required', 400);
    }

    // Get user by username
    const user = await getUserByUsername(username);

    // Get user stats
    const stats = await getUserStats(user.id);

    // Get recent activity (respecting privacy settings)
    let activity = null;
    if (user.showActivity !== false) {
      activity = await getUserActivity(user.id, { limit: 10 });
    }

    // Build public profile response
    const publicProfile = {
      id: user.id,
      name: user.name,
      avatar: user.image,
      bio: user.bio,
      showActivity: user.showActivity !== false,
      showBadges: user.showBadges !== false,
      createdAt: user.createdAt?.toISOString?.() || user.createdAt,
      stats: {
        articleCount: stats.articleCount,
        revisionCount: stats.revisionCount,
        commentCount: stats.commentCount,
        netVotes: stats.netVotes,
      },
      activity: activity?.data || [],
    };

    return successResponse(publicProfile);
  } catch (error) {
    console.error('Error fetching user profile:', error);
    
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
 * Handle OPTIONS for CORS preflight
 */
export const OPTIONS: APIRoute = async () => {
  return handleCors();
};

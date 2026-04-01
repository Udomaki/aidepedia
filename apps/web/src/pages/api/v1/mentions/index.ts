import type { APIRoute } from 'astro';
import { getMentions, getUnreadMentionCount } from '@aidepedia/db';
import { 
  successResponse, 
  errorResponse, 
  handleCors,
  getPaginationParams,
} from '../../../../lib/api-utils';
import { getSession } from '../../../../lib/auth';

/**
 * GET /api/v1/mentions
 * List mentions for the authenticated user
 * 
 * Query params:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 20, max: 100)
 * - unreadOnly: Filter to unread mentions only (default: false)
 */
export const GET: APIRoute = async ({ url, request }) => {
  try {
    // Check authentication
    const session = await getSession(request);
    if (!session?.user?.id) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    }

    const userId = parseInt(session.user.id as string, 10);
    if (isNaN(userId)) {
      return errorResponse('VALIDATION_ERROR', 'Invalid user ID', 400);
    }

    const { page, limit } = getPaginationParams(url);
    const unreadOnly = url.searchParams.get('unreadOnly') === 'true';

    // Fetch mentions
    const result = await getMentions(userId, { page, limit, unreadOnly });

    // Get unread count
    const unreadCount = await getUnreadMentionCount(userId);

    // Transform mentions for API response
    const mentions = result.data.map(mention => ({
      id: mention.id,
      type: mention.type,
      title: mention.title,
      content: mention.content,
      data: mention.data,
      read: mention.read,
      createdAt: mention.createdAt?.toISOString?.() || mention.createdAt,
    }));

    return successResponse({
      mentions,
      unreadCount,
    }, {
      total: result.meta.total,
      page: result.meta.page,
      limit: result.meta.limit,
      totalPages: result.meta.totalPages,
    });
  } catch (error) {
    console.error('Error fetching mentions:', error);
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to fetch mentions',
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

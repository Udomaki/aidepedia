import type { APIRoute } from 'astro';
import { getModerationQueue } from '@aidepedia/db';
import {
  successResponse,
  errorResponse,
  handleCors,
} from '../../../../../lib/api-utils';
import { getSession } from '../../../../../lib/auth';

/**
 * GET /api/v1/admin/moderation/queue
 * Get moderation queue items
 */
export const GET: APIRoute = async ({ url, request }) => {
  try {
    // Check authentication
    const session = await getSession(request);
    if (!session?.user?.id) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    }

    // Parse query parameters
    const status = url.searchParams.get('status') || 'pending';
    const queueType = url.searchParams.get('type') || undefined;
    const limit = parseInt(url.searchParams.get('limit') || '20', 10);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);

    // Get queue items
    const { items, total } = await getModerationQueue({
      status,
      queueType,
      limit,
      offset,
    });

    return successResponse({
      items,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    });
  } catch (error) {
    console.error('Error fetching moderation queue:', error);
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to fetch moderation queue',
      500
    );
  }
};

/**
 * OPTIONS /api/v1/admin/moderation/queue
 * Handle CORS preflight
 */
export const OPTIONS: APIRoute = async () => {
  return handleCors();
};

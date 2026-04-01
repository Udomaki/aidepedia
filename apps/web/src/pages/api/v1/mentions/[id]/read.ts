import type { APIRoute } from 'astro';
import { markMentionRead } from '@aidepedia/db';
import { 
  successResponse, 
  errorResponse, 
  handleCors,
} from '../../../../../lib/api-utils';
import { getSession } from '../../../../../lib/auth';

/**
 * PUT /api/v1/mentions/[id]/read
 * Mark a specific mention as read
 */
export const PUT: APIRoute = async ({ params, request }) => {
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

    const mentionId = parseInt(params.id as string, 10);
    if (isNaN(mentionId)) {
      return errorResponse('VALIDATION_ERROR', 'Invalid mention ID', 400);
    }

    // Mark mention as read
    const mention = await markMentionRead(mentionId, userId);

    return successResponse({
      id: mention.id,
      read: mention.read,
    });
  } catch (error) {
    console.error('Error marking mention as read:', error);
    
    if (error instanceof Error && error.message.includes('not found')) {
      return errorResponse('NOT_FOUND', 'Mention not found', 404);
    }
    
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to mark mention as read',
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

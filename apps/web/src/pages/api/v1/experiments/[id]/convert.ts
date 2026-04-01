import type { APIRoute } from 'astro';
import { trackConversion } from '@aidepedia/db';
import {
  successResponse,
  errorResponse,
  handleCors,
} from '../../../../../lib/api-utils';
import { getSession } from '../../../../../lib/auth';

/**
 * POST /api/v1/experiments/[id]/convert
 * Track a conversion for an experiment
 * 
 * Body:
 * - userId: string (optional, will use session user ID if not provided)
 */
export const POST: APIRoute = async ({ request, params }) => {
  try {
    const experimentId = parseInt(params.id, 10);

    if (isNaN(experimentId)) {
      return errorResponse('VALIDATION_ERROR', 'Invalid experiment ID', 400, request);
    }

    // Get user ID from body or session
    let userId: string | undefined;
    
    try {
      const body = await request.json();
      userId = body.userId;
    } catch {
      // No body, will try session
    }

    if (!userId) {
      const session = await getSession(request);
      if (session?.user?.id) {
        userId = String(session.user.id);
      } else {
        // For anonymous users, get from header
        const anonymousId = request.headers.get('x-anonymous-id');
        if (!anonymousId) {
          return errorResponse('VALIDATION_ERROR', 'userId is required for anonymous users', 400, request);
        }
        userId = `anon:${anonymousId}`;
      }
    }

    const assignment = await trackConversion(experimentId, userId);

    return successResponse({
      success: true,
      assignment: {
        variant: assignment.variant,
        converted: assignment.converted,
        convertedAt: assignment.convertedAt,
      },
    }, null, 200, request);
  } catch (error) {
    console.error('Error tracking conversion:', error);
    
    if (error instanceof Error && error.message.includes('not found')) {
      return errorResponse('NOT_FOUND', 'Assignment not found', 404, request);
    }
    
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to track conversion',
      500,
      request
    );
  }
};

/**
 * Handle OPTIONS for CORS preflight
 */
export const OPTIONS: APIRoute = async () => {
  return handleCors();
};

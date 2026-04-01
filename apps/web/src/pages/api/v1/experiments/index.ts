import type { APIRoute } from 'astro';
import {
  listExperiments,
  getOrAssignVariant,
} from '@aidepedia/db';
import {
  successResponse,
  errorResponse,
  handleCors,
  getPaginationParams,
} from '../../../../lib/api-utils';
import { getSession } from '../../../../lib/auth';

/**
 * GET /api/v1/experiments
 * List all experiments
 * 
 * Query params:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 20, max: 100)
 * - status: Filter by status (draft, running, paused, completed)
 */
export const GET: APIRoute = async ({ url, request }) => {
  try {
    const { page, limit } = getPaginationParams(url);
    const status = url.searchParams.get('status');

    const params: any = {
      page,
      limit,
    };

    if (status && ['draft', 'running', 'paused', 'completed'].includes(status)) {
      params.status = status;
    }

    const result = await listExperiments(params);

    return successResponse(result.data, {
      total: result.meta.total,
      page: result.meta.page,
      limit: result.meta.limit,
      totalPages: result.meta.totalPages,
    }, 200, request);
  } catch (error) {
    console.error('Error fetching experiments:', error);
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to fetch experiments',
      500,
      request
    );
  }
};

/**
 * POST /api/v1/experiments/[id]/assign
 * Get or create a variant assignment for the current user
 * 
 * Body:
 * - experimentId: number
 * - userId: string (optional, will use session user ID if not provided)
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { experimentId, userId: providedUserId } = body;

    if (!experimentId) {
      return errorResponse('VALIDATION_ERROR', 'experimentId is required', 400, request);
    }

    // Get user ID from session if not provided
    let userId = providedUserId;
    if (!userId) {
      const session = await getSession(request);
      if (session?.user?.id) {
        userId = String(session.user.id);
      } else {
        // For anonymous users, generate a unique ID from IP or use a provided anonymous ID
        const anonymousId = request.headers.get('x-anonymous-id');
        if (!anonymousId) {
          return errorResponse('VALIDATION_ERROR', 'userId is required for anonymous users', 400, request);
        }
        userId = `anon:${anonymousId}`;
      }
    }

    const result = await getOrAssignVariant(Number(experimentId), userId);

    return successResponse({
      variant: result.variant,
      isNew: result.isNew,
    }, null, 200, request);
  } catch (error) {
    console.error('Error assigning variant:', error);
    
    if (error instanceof Error && error.message.includes('not running')) {
      return errorResponse('VALIDATION_ERROR', error.message, 400, request);
    }
    
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to assign variant',
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

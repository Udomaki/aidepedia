import type { APIRoute } from 'astro';
import {
  getDashboard,
  updateDashboard,
  deleteDashboard,
} from '@aidepedia/db';
import {
  successResponse,
  errorResponse,
  handleCors,
} from '../../../../../lib/api-utils';
import { getSession } from '../../../../../lib/auth';

/**
 * GET /api/v1/analytics/dashboards/[id]
 * Get a specific dashboard
 */
export const GET: APIRoute = async ({ params, request }) => {
  try {
    const session = await getSession(request);
    if (!session?.user?.id) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    }

    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      return errorResponse('VALIDATION_ERROR', 'Invalid dashboard ID', 400);
    }

    const dashboard = await getDashboard(id);

    // Check if user owns the dashboard or it's public
    if (dashboard.userId !== session.user.id && !dashboard.isPublic) {
      return errorResponse('FORBIDDEN', 'Access denied', 403);
    }

    return successResponse(dashboard);
  } catch (error) {
    console.error('Error fetching dashboard:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to fetch dashboard', 500);
  }
};

/**
 * PUT /api/v1/analytics/dashboards/[id]
 * Update a dashboard
 */
export const PUT: APIRoute = async ({ params, request }) => {
  try {
    const session = await getSession(request);
    if (!session?.user?.id) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    }

    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      return errorResponse('VALIDATION_ERROR', 'Invalid dashboard ID', 400);
    }

    // Verify ownership
    const existing = await getDashboard(id);
    if (existing.userId !== session.user.id) {
      return errorResponse('FORBIDDEN', 'Access denied', 403);
    }

    const body = await request.json();
    const { name, description, isPublic, widgets } = body;

    const dashboard = await updateDashboard(id, {
      name,
      description,
      isPublic,
      widgets,
    });

    return successResponse(dashboard);
  } catch (error) {
    console.error('Error updating dashboard:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to update dashboard', 500);
  }
};

/**
 * DELETE /api/v1/analytics/dashboards/[id]
 * Delete a dashboard
 */
export const DELETE: APIRoute = async ({ params, request }) => {
  try {
    const session = await getSession(request);
    if (!session?.user?.id) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    }

    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      return errorResponse('VALIDATION_ERROR', 'Invalid dashboard ID', 400);
    }

    // Verify ownership
    const existing = await getDashboard(id);
    if (existing.userId !== session.user.id) {
      return errorResponse('FORBIDDEN', 'Access denied', 403);
    }

    await deleteDashboard(id);

    return successResponse({ message: 'Dashboard deleted successfully' });
  } catch (error) {
    console.error('Error deleting dashboard:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to delete dashboard', 500);
  }
};

/**
 * OPTIONS /api/v1/analytics/dashboards/[id]
 * Handle CORS preflight
 */
export const OPTIONS: APIRoute = () => {
  return handleCors();
};

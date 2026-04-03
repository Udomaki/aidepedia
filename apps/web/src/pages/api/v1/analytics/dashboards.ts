import type { APIRoute } from 'astro';
import { getSession } from '../../../../lib/auth';
import {
  createDashboard,
  getUserDashboards,
  getDashboard,
  updateDashboard,
  deleteDashboard,
  setDefaultDashboard,
  getDefaultDashboard,
} from '../../../../lib/analytics/dashboard-service';
import { successResponse, errorResponse } from '../../../../lib/api-utils';

/**
 * GET /api/v1/analytics/dashboards
 * Get all dashboards for user
 */
export const GET: APIRoute = async ({ request, url }) => {
  try {
    const session = await getSession(request);
    if (!session?.user?.email) {
      return errorResponse('UNAUTHORIZED', 'You must be logged in', 401);
    }

    const userId = session.user.email;
    const dashboardId = url.searchParams.get('id');

    if (dashboardId) {
      const dashboard = getDashboard(dashboardId);
      if (!dashboard) {
        return errorResponse('NOT_FOUND', 'Dashboard not found', 404);
      }
      return successResponse(dashboard);
    }

    const getDefault = url.searchParams.get('default') === 'true';
    if (getDefault) {
      const dashboard = getDefaultDashboard(userId);
      return successResponse(dashboard);
    }

    const dashboards = getUserDashboards(userId);
    return successResponse(dashboards);
  } catch (error) {
    console.error('Get dashboards error:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to fetch dashboards', 500);
  }
};

/**
 * POST /api/v1/analytics/dashboards
 * Create new dashboard
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    const session = await getSession(request);
    if (!session?.user?.email) {
      return errorResponse('UNAUTHORIZED', 'You must be logged in', 401);
    }

    const body = await request.json();
    const { name, description } = body;

    if (!name) {
      return errorResponse('VALIDATION_ERROR', 'Dashboard name is required', 400);
    }

    const dashboard = createDashboard(
      session.user.email,
      name,
      description
    );

    return successResponse(dashboard, 201);
  } catch (error) {
    console.error('Create dashboard error:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to create dashboard', 500);
  }
};

/**
 * PUT /api/v1/analytics/dashboards
 * Update dashboard
 */
export const PUT: APIRoute = async ({ request, url }) => {
  try {
    const session = await getSession(request);
    if (!session?.user?.email) {
      return errorResponse('UNAUTHORIZED', 'You must be logged in', 401);
    }

    const dashboardId = url.searchParams.get('id');
    if (!dashboardId) {
      return errorResponse('VALIDATION_ERROR', 'Dashboard ID is required', 400);
    }

    const body = await request.json();
    const { name, description, widgets, setDefault } = body;

    if (setDefault) {
      setDefaultDashboard(session.user.email, dashboardId);
    }

    const updates: any = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (widgets !== undefined) updates.widgets = widgets;

    const dashboard = updateDashboard(dashboardId, updates);
    if (!dashboard) {
      return errorResponse('NOT_FOUND', 'Dashboard not found', 404);
    }

    return successResponse(dashboard);
  } catch (error) {
    console.error('Update dashboard error:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to update dashboard', 500);
  }
};

/**
 * DELETE /api/v1/analytics/dashboards
 * Delete dashboard
 */
export const DELETE: APIRoute = async ({ request, url }) => {
  try {
    const session = await getSession(request);
    if (!session?.user?.email) {
      return errorResponse('UNAUTHORIZED', 'You must be logged in', 401);
    }

    const dashboardId = url.searchParams.get('id');
    if (!dashboardId) {
      return errorResponse('VALIDATION_ERROR', 'Dashboard ID is required', 400);
    }

    const deleted = deleteDashboard(dashboardId);
    if (!deleted) {
      return errorResponse('NOT_FOUND', 'Dashboard not found', 404);
    }

    return successResponse({ deleted: true });
  } catch (error) {
    console.error('Delete dashboard error:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to delete dashboard', 500);
  }
};

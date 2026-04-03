import type { APIRoute } from 'astro';
import { getSession } from '../../../../../lib/auth';
import {
  addWidget,
  updateWidget,
  removeWidget,
  getWidgetTemplates,
} from '../../../../../lib/analytics/dashboard-service';
import { successResponse, errorResponse } from '../../../../../lib/api-utils';

/**
 * GET /api/v1/analytics/dashboards/widgets
 * Get widget templates
 */
export const GET: APIRoute = async ({ request, url }) => {
  try {
    const session = await getSession(request);
    if (!session?.user?.email) {
      return errorResponse('UNAUTHORIZED', 'You must be logged in', 401);
    }

    const templates = url.searchParams.get('templates') === 'true';
    if (templates) {
      return successResponse(getWidgetTemplates());
    }

    return successResponse(getWidgetTemplates());
  } catch (error) {
    console.error('Get widgets error:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to fetch widgets', 500);
  }
};

/**
 * POST /api/v1/analytics/dashboards/widgets
 * Add widget to dashboard
 */
export const POST: APIRoute = async ({ request, url }) => {
  try {
    const session = await getSession(request);
    if (!session?.user?.email) {
      return errorResponse('UNAUTHORIZED', 'You must be logged in', 401);
    }

    const dashboardId = url.searchParams.get('dashboardId');
    if (!dashboardId) {
      return errorResponse('VALIDATION_ERROR', 'Dashboard ID is required', 400);
    }

    const body = await request.json();
    const { type, title, config, position } = body;

    if (!type || !title || !position) {
      return errorResponse('VALIDATION_ERROR', 'Widget type, title, and position are required', 400);
    }

    const widget = addWidget(dashboardId, {
      type,
      title,
      config: config || {},
      position,
    });

    if (!widget) {
      return errorResponse('NOT_FOUND', 'Dashboard not found', 404);
    }

    return successResponse(widget, 201);
  } catch (error) {
    console.error('Add widget error:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to add widget', 500);
  }
};

/**
 * PUT /api/v1/analytics/dashboards/widgets
 * Update widget
 */
export const PUT: APIRoute = async ({ request, url }) => {
  try {
    const session = await getSession(request);
    if (!session?.user?.email) {
      return errorResponse('UNAUTHORIZED', 'You must be logged in', 401);
    }

    const dashboardId = url.searchParams.get('dashboardId');
    const widgetId = url.searchParams.get('widgetId');

    if (!dashboardId || !widgetId) {
      return errorResponse('VALIDATION_ERROR', 'Dashboard ID and Widget ID are required', 400);
    }

    const body = await request.json();
    const { title, config, position } = body;

    const updates: any = {};
    if (title !== undefined) updates.title = title;
    if (config !== undefined) updates.config = config;
    if (position !== undefined) updates.position = position;

    const widget = updateWidget(dashboardId, widgetId, updates);
    if (!widget) {
      return errorResponse('NOT_FOUND', 'Widget or dashboard not found', 404);
    }

    return successResponse(widget);
  } catch (error) {
    console.error('Update widget error:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to update widget', 500);
  }
};

/**
 * DELETE /api/v1/analytics/dashboards/widgets
 * Delete widget
 */
export const DELETE: APIRoute = async ({ request, url }) => {
  try {
    const session = await getSession(request);
    if (!session?.user?.email) {
      return errorResponse('UNAUTHORIZED', 'You must be logged in', 401);
    }

    const dashboardId = url.searchParams.get('dashboardId');
    const widgetId = url.searchParams.get('widgetId');

    if (!dashboardId || !widgetId) {
      return errorResponse('VALIDATION_ERROR', 'Dashboard ID and Widget ID are required', 400);
    }

    const removed = removeWidget(dashboardId, widgetId);
    if (!removed) {
      return errorResponse('NOT_FOUND', 'Widget or dashboard not found', 404);
    }

    return successResponse({ removed: true });
  } catch (error) {
    console.error('Delete widget error:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to delete widget', 500);
  }
};

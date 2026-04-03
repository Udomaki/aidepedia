import type { APIRoute } from 'astro';
import {
  createDashboard,
  listUserDashboards,
} from '@aidepedia/db';
import {
  successResponse,
  errorResponse,
  handleCors,
} from '../../../../../lib/api-utils';
import { getSession } from '../../../../../lib/auth';

/**
 * GET /api/v1/analytics/dashboards
 * List user's dashboards
 */
export const GET: APIRoute = async ({ request }) => {
  try {
    const session = await getSession(request);
    if (!session?.user?.id) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    }

    const dashboards = await listUserDashboards(session.user.id);

    return successResponse(dashboards);
  } catch (error) {
    console.error('Error fetching dashboards:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to fetch dashboards', 500);
  }
};

/**
 * POST /api/v1/analytics/dashboards
 * Create a new dashboard
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    const session = await getSession(request);
    if (!session?.user?.id) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    }

    const body = await request.json();
    const { name, description, isPublic, widgets } = body;

    if (!name || !widgets || !Array.isArray(widgets)) {
      return errorResponse('VALIDATION_ERROR', 'Name and widgets are required', 400);
    }

    const dashboard = await createDashboard({
      name,
      description,
      userId: session.user.id,
      isPublic: isPublic || false,
      widgets,
    });

    return successResponse(dashboard, null, 201);
  } catch (error) {
    console.error('Error creating dashboard:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to create dashboard', 500);
  }
};

/**
 * OPTIONS /api/v1/analytics/dashboards
 * Handle CORS preflight
 */
export const OPTIONS: APIRoute = () => {
  return handleCors();
};

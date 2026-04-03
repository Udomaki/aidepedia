import type { APIRoute } from 'astro';
import {
  createReport,
  listUserReports,
} from '@aidepedia/db';
import {
  successResponse,
  errorResponse,
  handleCors,
} from '../../../../../lib/api-utils';
import { getSession } from '../../../../../lib/auth';

/**
 * GET /api/v1/analytics/reports
 * List user's reports
 */
export const GET: APIRoute = async ({ request }) => {
  try {
    const session = await getSession(request);
    if (!session?.user?.id) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    }

    const reports = await listUserReports(session.user.id);

    return successResponse(reports);
  } catch (error) {
    console.error('Error fetching reports:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to fetch reports', 500);
  }
};

/**
 * POST /api/v1/analytics/reports
 * Create a new report
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    const session = await getSession(request);
    if (!session?.user?.id) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    }

    const body = await request.json();
    const { name, description, type, config } = body;

    if (!name || !type || !config) {
      return errorResponse('VALIDATION_ERROR', 'Name, type, and config are required', 400);
    }

    const validTypes = ['usage', 'content', 'user', 'revenue', 'retention'];
    if (!validTypes.includes(type)) {
      return errorResponse('VALIDATION_ERROR', 'Invalid report type', 400);
    }

    const report = await createReport({
      name,
      description,
      type,
      userId: session.user.id,
      config,
    });

    return successResponse(report, null, 201);
  } catch (error) {
    console.error('Error creating report:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to create report', 500);
  }
};

/**
 * OPTIONS /api/v1/analytics/reports
 * Handle CORS preflight
 */
export const OPTIONS: APIRoute = () => {
  return handleCors();
};

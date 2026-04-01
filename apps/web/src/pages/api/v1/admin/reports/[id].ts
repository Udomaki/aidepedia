import type { APIRoute } from 'astro';
import { getSession } from '../../../../../lib/auth';
import { updateContentReportStatus, getContentReportById } from '@aidepedia/db';
import {
  successResponse,
  errorResponse,
  handleCors,
} from '../../../../../lib/api-utils';

/**
 * GET /api/v1/admin/reports/[id]
 * Get a specific content report (admin only)
 */
export const GET: APIRoute = async ({ request, params }) => {
  try {
    const session = await getSession(request);
    if (!session?.user?.id) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    }

    // TODO: Add proper admin check

    const reportId = parseInt(params.id);
    if (isNaN(reportId)) {
      return errorResponse('VALIDATION_ERROR', 'Invalid report ID', 400);
    }

    const report = await getContentReportById(reportId);
    return successResponse(report);
  } catch (error) {
    console.error('Error fetching report:', error);
    
    if (error instanceof Error && error.message.includes('not found')) {
      return errorResponse('NOT_FOUND', 'Report not found', 404);
    }
    
    return errorResponse('INTERNAL_ERROR', 'Failed to fetch report', 500);
  }
};

/**
 * PUT /api/v1/admin/reports/[id]
 * Update content report status (admin only)
 */
export const PUT: APIRoute = async ({ request, params }) => {
  try {
    const session = await getSession(request);
    if (!session?.user?.id) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    }

    // TODO: Add proper admin check

    const reportId = parseInt(params.id);
    if (isNaN(reportId)) {
      return errorResponse('VALIDATION_ERROR', 'Invalid report ID', 400);
    }

    const body = await request.json();
    const { status } = body;

    // Validate status
    const validStatuses = ['pending', 'reviewed', 'resolved', 'dismissed'];
    if (!validStatuses.includes(status)) {
      return errorResponse('VALIDATION_ERROR', `Invalid status. Must be one of: ${validStatuses.join(', ')}`, 400);
    }

    const report = await updateContentReportStatus(
      reportId,
      status,
      parseInt(session.user.id)
    );

    return successResponse(report);
  } catch (error) {
    console.error('Error updating report:', error);
    
    if (error instanceof Error && error.message.includes('not found')) {
      return errorResponse('NOT_FOUND', 'Report not found', 404);
    }
    
    return errorResponse('INTERNAL_ERROR', 'Failed to update report', 500);
  }
};

/**
 * OPTIONS for CORS
 */
export const OPTIONS: APIRoute = async () => {
  return handleCors();
};

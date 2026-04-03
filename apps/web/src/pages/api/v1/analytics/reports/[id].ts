import type { APIRoute } from 'astro';
import {
  getReport,
  deleteReport,
  getUsageAnalytics,
  getContentAnalytics,
  getUserAnalytics,
  getRevenueAnalytics,
  getRetentionAnalytics,
} from '@aidepedia/db';
import {
  successResponse,
  errorResponse,
  handleCors,
} from '../../../../../lib/api-utils';
import { getSession } from '../../../../../lib/auth';

/**
 * GET /api/v1/analytics/reports/[id]
 * Get a specific report with data
 */
export const GET: APIRoute = async ({ params, request }) => {
  try {
    const session = await getSession(request);
    if (!session?.user?.id) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    }

    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      return errorResponse('VALIDATION_ERROR', 'Invalid report ID', 400);
    }

    const report = await getReport(id);

    // Check ownership
    if (report.userId !== session.user.id) {
      return errorResponse('FORBIDDEN', 'Access denied', 403);
    }

    // Parse date range
    const startDate = new Date(report.config.dateRange.start);
    const endDate = new Date(report.config.dateRange.end);

    // Fetch analytics data based on report type
    let data: any;
    switch (report.type) {
      case 'usage':
        data = await getUsageAnalytics(startDate, endDate);
        break;
      case 'content':
        data = await getContentAnalytics(startDate, endDate);
        break;
      case 'user':
        data = await getUserAnalytics(startDate, endDate);
        break;
      case 'revenue':
        data = await getRevenueAnalytics(startDate, endDate);
        break;
      case 'retention':
        data = await getRetentionAnalytics();
        break;
      default:
        return errorResponse('VALIDATION_ERROR', 'Invalid report type', 400);
    }

    return successResponse({
      report,
      data,
    });
  } catch (error) {
    console.error('Error fetching report:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to fetch report', 500);
  }
};

/**
 * DELETE /api/v1/analytics/reports/[id]
 * Delete a report
 */
export const DELETE: APIRoute = async ({ params, request }) => {
  try {
    const session = await getSession(request);
    if (!session?.user?.id) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    }

    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      return errorResponse('VALIDATION_ERROR', 'Invalid report ID', 400);
    }

    // Verify ownership
    const existing = await getReport(id);
    if (existing.userId !== session.user.id) {
      return errorResponse('FORBIDDEN', 'Access denied', 403);
    }

    await deleteReport(id);

    return successResponse({ message: 'Report deleted successfully' });
  } catch (error) {
    console.error('Error deleting report:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to delete report', 500);
  }
};

/**
 * OPTIONS /api/v1/analytics/reports/[id]
 * Handle CORS preflight
 */
export const OPTIONS: APIRoute = () => {
  return handleCors();
};

import type { APIRoute } from 'astro';
import {
  getUsageAnalytics,
  getContentAnalytics,
  getUserAnalytics,
  getRevenueAnalytics,
  getRetentionAnalytics,
  createExportRecord,
  getExportHistory,
} from '@aidepedia/db';
import {
  successResponse,
  errorResponse,
  handleCors,
} from '../../../../lib/api-utils';
import { getSession } from '../../../../lib/auth';
import { exportToCSV, exportToJSON } from '../../../../lib/dashboards';

/**
 * GET /api/v1/analytics/export
 * Get export history
 */
export const GET: APIRoute = async ({ request }) => {
  try {
    const session = await getSession(request);
    if (!session?.user?.id) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    }

    const history = await getExportHistory(session.user.id);

    return successResponse(history);
  } catch (error) {
    console.error('Error fetching export history:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to fetch export history', 500);
  }
};

/**
 * POST /api/v1/analytics/export
 * Export analytics data
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    const session = await getSession(request);
    if (!session?.user?.id) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    }

    const body = await request.json();
    const { reportType, format, dateRange } = body;

    if (!reportType || !format) {
      return errorResponse('VALIDATION_ERROR', 'Report type and format are required', 400);
    }

    const validFormats = ['csv', 'json', 'pdf'];
    if (!validFormats.includes(format)) {
      return errorResponse('VALIDATION_ERROR', 'Invalid format', 400);
    }

    const validTypes = ['usage', 'content', 'user', 'revenue', 'retention'];
    if (!validTypes.includes(reportType)) {
      return errorResponse('VALIDATION_ERROR', 'Invalid report type', 400);
    }

    // Parse date range
    const startDate = new Date(dateRange?.start || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
    const endDate = new Date(dateRange?.end || new Date());

    // Fetch data
    let data: any;
    switch (reportType) {
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
    }

    // Export to requested format
    let exportData: string;
    let contentType: string;
    let fileExtension: string;

    if (format === 'csv') {
      exportData = await exportToCSV(Array.isArray(data) ? data : [data], reportType);
      contentType = 'text/csv';
      fileExtension = 'csv';
    } else if (format === 'json') {
      exportData = await exportToJSON(data);
      contentType = 'application/json';
      fileExtension = 'json';
    } else {
      // PDF would require a library like jsPDF or puppeteer
      return errorResponse('NOT_IMPLEMENTED', 'PDF export not yet implemented', 501);
    }

    // Create export record
    const exportRecord = await createExportRecord({
      userId: session.user.id,
      reportType,
      format,
      dateRange: { start: startDate.toISOString(), end: endDate.toISOString() },
      recordCount: Array.isArray(data) ? data.length : 1,
      fileSize: Buffer.byteLength(exportData, 'utf8'),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    });

    // Return the export data
    return new Response(exportData, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${reportType}-export-${Date.now()}.${fileExtension}"`,
      },
    });
  } catch (error) {
    console.error('Error exporting data:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to export data', 500);
  }
};

/**
 * OPTIONS /api/v1/analytics/export
 * Handle CORS preflight
 */
export const OPTIONS: APIRoute = () => {
  return handleCors();
};

import type { APIRoute } from 'astro';
import { getSession } from '../../../../lib/auth';
import { getAuditLogs } from '@aidepedia/db';
import { successResponse, errorResponse } from '../../../../lib/api-utils';

/**
 * GET /api/v1/admin/audit-log
 * List audit logs with filters (admin only)
 * Query params: page, limit, userId, action, resourceType, dateFrom, dateTo
 */
export const GET: APIRoute = async ({ request, url }) => {
  try {
    // Check authentication and admin status
    const session = await getSession(request);
    if (!session?.user?.email) {
      return errorResponse('UNAUTHORIZED', 'You must be logged in', 401);
    }

    const isAdmin = (session.user as any)?.role === 'admin' || (session.user as any)?.tier === 'admin';
    if (!isAdmin) {
      return errorResponse('FORBIDDEN', 'Admin access required', 403);
    }

    // Parse query parameters
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const limit = Math.min(100, parseInt(url.searchParams.get('limit') || '50', 10));
    const userId = url.searchParams.get('userId') ? parseInt(url.searchParams.get('userId')!, 10) : undefined;
    const action = url.searchParams.get('action') || undefined;
    const resourceType = url.searchParams.get('resourceType') || undefined;
    const dateFrom = url.searchParams.get('dateFrom') || undefined;
    const dateTo = url.searchParams.get('dateTo') || undefined;
    const exportCsv = url.searchParams.get('export') === 'csv';

    // Get audit logs
    const result = await getAuditLogs({
      page,
      limit,
      userId,
      action,
      resourceType,
      dateFrom,
      dateTo,
    });

    // Handle CSV export
    if (exportCsv) {
      const csvHeaders = ['ID', 'User', 'Action', 'Resource Type', 'Resource ID', 'Details', 'IP Address', 'Created At'];
      const csvRows = result.data.map(log => [
        log.id,
        log.user?.name || log.user?.email || 'System',
        log.action,
        log.resourceType,
        log.resourceId || '',
        log.details ? JSON.stringify(log.details) : '',
        log.ipAddress || '',
        log.createdAt?.toISOString() || '',
      ]);

      const csvContent = [
        csvHeaders.join(','),
        ...csvRows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
      ].join('\n');

      return new Response(csvContent, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="audit-log-${new Date().toISOString().split('T')[0]}.csv"`,
        },
      });
    }

    return successResponse(result);
  } catch (error) {
    console.error('List audit logs error:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to list audit logs', 500);
  }
};

/**
 * OPTIONS /api/v1/admin/audit-log
 * Handle CORS preflight
 */
export const OPTIONS: APIRoute = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
};

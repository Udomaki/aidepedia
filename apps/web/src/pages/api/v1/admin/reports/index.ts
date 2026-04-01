import type { APIRoute } from 'astro';
import { getSession } from '../../../../../lib/auth';
import { listContentReports } from '@aidepedia/db';
import {
  successResponse,
  errorResponse,
  handleCors,
  getPaginationParams,
} from '../../../../../lib/api-utils';

/**
 * GET /api/v1/admin/reports
 * List all content reports with filters (admin only)
 */
export const GET: APIRoute = async ({ request, url }) => {
  try {
    const session = await getSession(request);
    if (!session?.user?.id) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    }

    // TODO: Add proper admin check
    // For now, we'll check if the user exists in session
    // In production, you'd check user.role or similar

    const { page, limit } = getPaginationParams(url);
    const status = url.searchParams.get('status') as 'pending' | 'reviewed' | 'resolved' | 'dismissed' | null;
    const reason = url.searchParams.get('reason') as 'spam' | 'harassment' | 'misinformation' | 'inappropriate' | 'copyright' | 'other' | null;
    const contentType = url.searchParams.get('contentType') as 'article' | 'comment' | null;

    const result = await listContentReports({
      page,
      limit,
      ...(status && { status }),
      ...(reason && { reason }),
      ...(contentType && { contentType }),
    });

    return successResponse(result.data, {
      total: result.meta.total,
      page: result.meta.page,
      limit: result.meta.limit,
      totalPages: result.meta.totalPages,
    });
  } catch (error) {
    console.error('Error fetching admin reports:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to fetch reports', 500);
  }
};

/**
 * OPTIONS for CORS
 */
export const OPTIONS: APIRoute = async () => {
  return handleCors();
};

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
 * GET /api/v1/users/me/reports
 * Get the current user's content reports
 */
export const GET: APIRoute = async ({ request, url }) => {
  try {
    const session = await getSession(request);
    if (!session?.user?.id) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    }

    const { page, limit } = getPaginationParams(url);
    const status = url.searchParams.get('status') as 'pending' | 'reviewed' | 'resolved' | 'dismissed' | null;

    const result = await listContentReports({
      reporterId: parseInt(session.user.id),
      page,
      limit,
      ...(status && { status }),
    });

    return successResponse(result.data, {
      total: result.meta.total,
      page: result.meta.page,
      limit: result.meta.limit,
      totalPages: result.meta.totalPages,
    });
  } catch (error) {
    console.error('Error fetching user reports:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to fetch reports', 500);
  }
};

/**
 * OPTIONS for CORS
 */
export const OPTIONS: APIRoute = async () => {
  return handleCors();
};

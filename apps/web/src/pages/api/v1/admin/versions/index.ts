import type { APIRoute } from 'astro';
import { 
  successResponse, 
  errorResponse, 
  handleCors 
} from '../../../../../lib/api-utils';
import { 
  getAllVersions, 
  LATEST_VERSION,
  API_VERSIONS 
} from '../../../../../lib/api-version';
import { getSession } from '../../../../../lib/auth';

/**
 * GET /api/v1/admin/versions
 * List all API versions with their status
 * 
 * Admin-only endpoint
 */
export const GET: APIRoute = async ({ request }) => {
  try {
    // Check authentication
    const session = await getSession(request);
    if (!session?.user?.id) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401, request);
    }

    // Check admin role
    const isAdmin = (session.user as any)?.role === 'admin' || 
                    (session.user as any)?.tier === 'admin';
    
    if (!isAdmin) {
      return errorResponse('FORBIDDEN', 'Admin access required', 403, request);
    }

    const versions = getAllVersions();
    
    return successResponse({
      versions,
      currentVersion: LATEST_VERSION,
      total: versions.length,
    }, undefined, 200, request);
  } catch (error) {
    console.error('Error fetching API versions:', error);
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to fetch API versions',
      500,
      request
    );
  }
};

/**
 * OPTIONS /api/v1/admin/versions
 * Handle CORS preflight
 */
export const OPTIONS: APIRoute = async () => {
  return handleCors();
};

import type { APIRoute } from 'astro';
import { 
  successResponse, 
  errorResponse, 
  handleCors 
} from '../../../../../lib/api-utils';
import { 
  getVersion,
  isValidVersion,
  API_VERSIONS
} from '../../../../../lib/api-version';
import { getSession } from '../../../../../lib/auth';

/**
 * In-memory store for deprecation dates (in production, this would be in the database)
 * Maps version -> { deprecationDate, sunsetDate }
 */
const deprecationSettings: Record<string, { deprecationDate?: string; sunsetDate?: string }> = {};

/**
 * GET /api/v1/admin/versions/[version]
 * Get details for a specific API version
 */
export const GET: APIRoute = async ({ params, request }) => {
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

    const { version } = params;
    
    if (!version || !isValidVersion(version)) {
      return errorResponse('VALIDATION_ERROR', 'Invalid version number', 400, request);
    }

    const versionInfo = getVersion(version);
    const settings = deprecationSettings[version];
    
    // Merge base version info with any custom settings
    const response = {
      ...versionInfo,
      customDeprecationDate: settings?.deprecationDate,
      customSunsetDate: settings?.sunsetDate,
    };
    
    return successResponse(response, undefined, 200, request);
  } catch (error) {
    console.error('Error fetching API version:', error);
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to fetch API version',
      500,
      request
    );
  }
};

/**
 * PATCH /api/v1/admin/versions/[version]
 * Update deprecation settings for a version
 * 
 * Body:
 * - deprecationDate: ISO date string (optional)
 * - sunsetDate: ISO date string (optional)
 */
export const PATCH: APIRoute = async ({ params, request }) => {
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

    const { version } = params;
    
    if (!version || !isValidVersion(version)) {
      return errorResponse('VALIDATION_ERROR', 'Invalid version number', 400, request);
    }

    // Parse request body
    const body = await request.json();
    const { deprecationDate, sunsetDate } = body;

    // Validate dates if provided
    if (deprecationDate) {
      const date = new Date(deprecationDate);
      if (isNaN(date.getTime())) {
        return errorResponse('VALIDATION_ERROR', 'Invalid deprecation date format', 400, request);
      }
    }

    if (sunsetDate) {
      const date = new Date(sunsetDate);
      if (isNaN(date.getTime())) {
        return errorResponse('VALIDATION_ERROR', 'Invalid sunset date format', 400, request);
      }
    }

    // Update settings
    if (!deprecationSettings[version]) {
      deprecationSettings[version] = {};
    }
    
    if (deprecationDate !== undefined) {
      deprecationSettings[version].deprecationDate = deprecationDate;
    }
    if (sunsetDate !== undefined) {
      deprecationSettings[version].sunsetDate = sunsetDate;
    }

    const versionInfo = getVersion(version);
    
    // Log the change
    console.log('[API Version Admin]', {
      action: 'update_deprecation',
      version,
      deprecationDate,
      sunsetDate,
      updatedBy: session.user.id,
      timestamp: new Date().toISOString(),
    });
    
    return successResponse({
      ...versionInfo,
      customDeprecationDate: deprecationSettings[version].deprecationDate,
      customSunsetDate: deprecationSettings[version].sunsetDate,
      message: 'Deprecation settings updated successfully',
    }, undefined, 200, request);
  } catch (error) {
    console.error('Error updating API version:', error);
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to update API version',
      500,
      request
    );
  }
};

/**
 * OPTIONS /api/v1/admin/versions/[version]
 * Handle CORS preflight
 */
export const OPTIONS: APIRoute = async () => {
  return handleCors();
};

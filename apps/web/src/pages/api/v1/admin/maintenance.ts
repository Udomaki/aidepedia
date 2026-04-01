import type { APIRoute } from 'astro';
import { getSession } from '../../../../lib/auth';
import { 
  getMaintenanceModeSettings, 
  setMaintenanceModeSettings,
  createAuditLog 
} from '@aidepedia/db/queries';
import { successResponse, errorResponse } from '../../../../lib/api-utils';
import type { MaintenanceModeSettings } from '@aidepedia/db/types';

/**
 * GET /api/v1/admin/maintenance
 * Get current maintenance mode settings (admin only)
 */
export const GET: APIRoute = async ({ request }) => {
  try {
    // Check authentication
    const session = await getSession(request);
    if (!session?.user?.email) {
      return errorResponse('UNAUTHORIZED', 'You must be logged in', 401);
    }

    // Check admin role
    const isAdmin = (session.user as any)?.role === 'admin' || 
                    (session.user as any)?.tier === 'admin';
    
    if (!isAdmin) {
      return errorResponse('FORBIDDEN', 'Admin access required', 403);
    }

    const settings = await getMaintenanceModeSettings();
    
    return successResponse(settings);
  } catch (error) {
    console.error('Maintenance settings fetch error:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to fetch maintenance settings', 500);
  }
};

/**
 * POST /api/v1/admin/maintenance
 * Update maintenance mode settings (admin only)
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    // Check authentication
    const session = await getSession(request);
    if (!session?.user?.email) {
      return errorResponse('UNAUTHORIZED', 'You must be logged in', 401);
    }

    // Check admin role
    const isAdmin = (session.user as any)?.role === 'admin' || 
                    (session.user as any)?.tier === 'admin';
    
    if (!isAdmin) {
      return errorResponse('FORBIDDEN', 'Admin access required', 403);
    }

    // Parse request body
    const body = await request.json() as Partial<MaintenanceModeSettings>;
    
    // Validate input
    if (body.enabled !== undefined && typeof body.enabled !== 'boolean') {
      return errorResponse('VALIDATION_ERROR', 'enabled must be a boolean', 400);
    }
    
    if (body.message !== undefined && typeof body.message !== 'string') {
      return errorResponse('VALIDATION_ERROR', 'message must be a string', 400);
    }
    
    if (body.estimatedTime !== undefined && typeof body.estimatedTime !== 'string') {
      return errorResponse('VALIDATION_ERROR', 'estimatedTime must be a string', 400);
    }
    
    if (body.contactEmail !== undefined && typeof body.contactEmail !== 'string') {
      return errorResponse('VALIDATION_ERROR', 'contactEmail must be a string', 400);
    }

    // Update settings
    const userId = (session.user as any)?.id;
    const settings = await setMaintenanceModeSettings(body, userId);

    // Create audit log
    await createAuditLog({
      userId: userId,
      action: 'settings.changed',
      resourceType: 'maintenance_mode',
      resourceId: 'maintenance_mode',
      details: {
        changes: body,
        enabled: settings.enabled,
      },
      ipAddress: request.headers.get('x-forwarded-for') || 
                 request.headers.get('x-real-ip') || 
                 null,
      userAgent: request.headers.get('user-agent') || null,
    });
    
    return successResponse(settings);
  } catch (error) {
    console.error('Maintenance settings update error:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to update maintenance settings', 500);
  }
};

import type { APIRoute } from 'astro';
import { getSession } from '../../../../../lib/auth';
import { 
  getEmailDigestSettings,
  updateEmailDigestSettings,
  NotFoundError
} from '@aidepedia/db';
import { 
  successResponse, 
  errorResponse, 
  handleCors 
} from '../../../../../lib/api-utils';

/**
 * GET /api/v1/users/me/digest-settings
 * Get current user's email digest settings
 */
export const GET: APIRoute = async ({ request }) => {
  try {
    const session = await getSession(request);
    
    if (!session?.user?.id) {
      return errorResponse('UNAUTHORIZED', 'You must be logged in', 401);
    }

    const settings = await getEmailDigestSettings(parseInt(session.user.id as string));

    return successResponse(settings);
  } catch (error) {
    console.error('Error fetching digest settings:', error);
    
    if (error instanceof NotFoundError) {
      return errorResponse('NOT_FOUND', 'User not found', 404);
    }
    
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to fetch digest settings',
      500
    );
  }
};

/**
 * PUT /api/v1/users/me/digest-settings
 * Update current user's email digest settings
 */
export const PUT: APIRoute = async ({ request }) => {
  try {
    const session = await getSession(request);
    
    if (!session?.user?.id) {
      return errorResponse('UNAUTHORIZED', 'You must be logged in', 401);
    }

    // Parse request body
    const body = await request.json();
    const { dailyEnabled, weeklyEnabled } = body;

    // Validate inputs
    if (dailyEnabled !== undefined && typeof dailyEnabled !== 'boolean') {
      return errorResponse('VALIDATION_ERROR', 'dailyEnabled must be a boolean', 400);
    }

    if (weeklyEnabled !== undefined && typeof weeklyEnabled !== 'boolean') {
      return errorResponse('VALIDATION_ERROR', 'weeklyEnabled must be a boolean', 400);
    }

    // Update settings
    const updatedSettings = await updateEmailDigestSettings(
      parseInt(session.user.id as string),
      { dailyEnabled, weeklyEnabled }
    );

    return successResponse(updatedSettings);
  } catch (error) {
    console.error('Error updating digest settings:', error);
    
    if (error instanceof NotFoundError) {
      return errorResponse('NOT_FOUND', 'User not found', 404);
    }
    
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to update digest settings',
      500
    );
  }
};

/**
 * Handle OPTIONS for CORS preflight
 */
export const OPTIONS: APIRoute = async () => {
  return handleCors();
};

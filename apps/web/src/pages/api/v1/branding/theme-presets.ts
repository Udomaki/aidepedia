import type { APIRoute } from 'astro';
import { 
  getThemePresets, 
  createThemePreset, 
  applyThemePreset,
  DEFAULT_PRESETS,
  type Theme
} from '../../../../lib/theme-editor';
import { 
  successResponse, 
  errorResponse, 
  handleCors,
  requireAuth 
} from '../../../../lib/api-utils';

/**
 * GET /api/v1/branding/theme-presets
 * Get available theme presets
 * 
 * Query params:
 * - organizationId: Organization ID (optional, for org-specific presets)
 */
export const GET: APIRoute = async ({ url, request }) => {
  try {
    const session = await requireAuth(request);
    if (!session) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    }

    const organizationId = url.searchParams.get('organizationId');

    let presets;
    if (organizationId) {
      // Get organization's presets + public presets
      presets = await getThemePresets(parseInt(organizationId, 10));
    } else {
      // Get default public presets only
      presets = DEFAULT_PRESETS;
    }

    return successResponse(presets);
  } catch (error) {
    console.error('Error fetching theme presets:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to fetch theme presets', 500);
  }
};

/**
 * POST /api/v1/branding/theme-presets
 * Create a new theme preset
 * 
 * Body:
 * - organizationId: Organization ID
 * - name: Preset name
 * - description: Preset description
 * - isPublic: Whether preset is public
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    const session = await requireAuth(request);
    if (!session) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    }

    const body = await request.json();
    const { organizationId, name, description, isPublic } = body;

    if (!organizationId || !name) {
      return errorResponse('VALIDATION_ERROR', 'Organization ID and name are required', 400);
    }

    const presetId = await createThemePreset(
      parseInt(organizationId, 10),
      name,
      description || null,
      isPublic || false,
      session.user.id
    );

    return successResponse({ 
      id: presetId,
      message: 'Theme preset created successfully' 
    }, 201);
  } catch (error) {
    console.error('Error creating theme preset:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to create theme preset', 500);
  }
};

/**
 * PUT /api/v1/branding/theme-presets
 * Apply a theme preset to organization
 * 
 * Body:
 * - organizationId: Organization ID
 * - presetId: Preset ID to apply
 */
export const PUT: APIRoute = async ({ request }) => {
  try {
    const session = await requireAuth(request);
    if (!session) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    }

    const body = await request.json();
    const { organizationId, presetId } = body;

    if (!organizationId || !presetId) {
      return errorResponse('VALIDATION_ERROR', 'Organization ID and preset ID are required', 400);
    }

    await applyThemePreset(
      parseInt(organizationId, 10),
      parseInt(presetId, 10),
      session.user.id
    );

    return successResponse({ message: 'Theme preset applied successfully' });
  } catch (error) {
    console.error('Error applying theme preset:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to apply theme preset', 500);
  }
};

/**
 * OPTIONS /api/v1/branding/theme-presets
 * Handle CORS preflight
 */
export const OPTIONS: APIRoute = async () => {
  return handleCors();
};

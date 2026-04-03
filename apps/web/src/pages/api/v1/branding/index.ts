import type { APIRoute } from 'astro';
import { db, eq, and } from '@aidepedia/db';
import { organization_branding, organization_members } from '@aidepedia/db/schema';
import { 
  successResponse, 
  errorResponse, 
  handleCors,
  requireAuth,
  requireOrganizationAdmin
} from '../../../../lib/api-utils';
import { 
  updateTheme, 
  exportTheme, 
  importTheme, 
  resetTheme,
  generateCSSVariables,
  type Theme
} from '../../../../lib/theme-editor';

/**
 * GET /api/v1/branding
 * Get branding settings for an organization
 * 
 * Query params:
 * - organizationId: Organization ID
 */
export const GET: APIRoute = async ({ url, request }) => {
  try {
    const session = await requireAuth(request);
    if (!session) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    }

    const organizationId = url.searchParams.get('organizationId');
    if (!organizationId) {
      return errorResponse('VALIDATION_ERROR', 'Organization ID is required', 400);
    }

    // Verify user has access to organization
    const membership = await db
      .select()
      .from(organization_members)
      .where(
        and(
          eq(organization_members.organizationId, parseInt(organizationId, 10)),
          eq(organization_members.userId, session.user.id)
        )
      )
      .limit(1);

    if (membership.length === 0) {
      return errorResponse('FORBIDDEN', 'Access denied to organization', 403);
    }

    // Get branding settings
    const [branding] = await db
      .select()
      .from(organization_branding)
      .where(eq(organization_branding.organizationId, parseInt(organizationId, 10)))
      .limit(1);

    if (!branding) {
      // Return default branding
      const defaultBranding = {
        organizationId: parseInt(organizationId, 10),
        primaryColor: '#3B82F6',
        secondaryColor: '#1E40AF',
        accentColor: '#F59E0B',
        backgroundColor: '#FFFFFF',
        textColor: '#1F2937',
        fontHeading: 'Inter',
        fontBody: 'Inter',
        themePreset: 'light',
        showPoweredBy: true,
      };

      return successResponse(defaultBranding);
    }

    return successResponse(branding);
  } catch (error) {
    console.error('Error fetching branding:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to fetch branding settings', 500);
  }
};

/**
 * PUT /api/v1/branding
 * Update branding settings for an organization
 * 
 * Body:
 * - organizationId: Organization ID
 * - branding: Branding settings to update
 */
export const PUT: APIRoute = async ({ request }) => {
  try {
    const session = await requireAuth(request);
    if (!session) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    }

    const body = await request.json();
    const { organizationId, branding } = body;

    if (!organizationId || !branding) {
      return errorResponse('VALIDATION_ERROR', 'Organization ID and branding are required', 400);
    }

    // Verify user is organization admin
    const isAdmin = await requireOrganizationAdmin(session.user.id, organizationId);
    if (!isAdmin) {
      return errorResponse('FORBIDDEN', 'Admin access required', 403);
    }

    // Update theme
    const theme: Partial<Theme> = {
      colors: {
        primary: branding.primaryColor,
        secondary: branding.secondaryColor,
        accent: branding.accentColor,
        background: branding.backgroundColor,
        text: branding.textColor,
      },
      fonts: {
        heading: branding.fontHeading,
        body: branding.fontBody,
      },
      themeConfig: branding.themeConfig,
      customCss: branding.customCss,
    };

    await updateTheme(organizationId, theme, session.user.id);

    return successResponse({ message: 'Branding updated successfully' });
  } catch (error) {
    console.error('Error updating branding:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to update branding settings', 500);
  }
};

/**
 * POST /api/v1/branding
 * Create branding settings for an organization
 * 
 * Body:
 * - organizationId: Organization ID
 * - branding: Branding settings
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    const session = await requireAuth(request);
    if (!session) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    }

    const body = await request.json();
    const { organizationId, branding } = body;

    if (!organizationId || !branding) {
      return errorResponse('VALIDATION_ERROR', 'Organization ID and branding are required', 400);
    }

    // Verify user is organization admin
    const isAdmin = await requireOrganizationAdmin(session.user.id, organizationId);
    if (!isAdmin) {
      return errorResponse('FORBIDDEN', 'Admin access required', 403);
    }

    // Check if branding already exists
    const [existing] = await db
      .select()
      .from(organization_branding)
      .where(eq(organization_branding.organizationId, organizationId))
      .limit(1);

    if (existing) {
      return errorResponse('CONFLICT', 'Branding already exists for this organization', 409);
    }

    // Create branding
    const [newBranding] = await db
      .insert(organization_branding)
      .values({
        organizationId,
        primaryColor: branding.primaryColor || '#3B82F6',
        secondaryColor: branding.secondaryColor || '#1E40AF',
        accentColor: branding.accentColor || '#F59E0B',
        backgroundColor: branding.backgroundColor || '#FFFFFF',
        textColor: branding.textColor || '#1F2937',
        fontHeading: branding.fontHeading || 'Inter',
        fontBody: branding.fontBody || 'Inter',
        themePreset: branding.themePreset || 'light',
        themeConfig: branding.themeConfig || {},
        customCss: branding.customCss,
        logoUrl: branding.logoUrl,
        logoDarkUrl: branding.logoDarkUrl,
        faviconUrl: branding.faviconUrl,
        brandName: branding.brandName,
        brandTagline: branding.brandTagline,
        brandDescription: branding.brandDescription,
        socialLinks: branding.socialLinks,
        footerText: branding.footerText,
        footerLinks: branding.footerLinks,
        showPoweredBy: branding.showPoweredBy ?? true,
      })
      .returning();

    return successResponse(newBranding, 201);
  } catch (error) {
    console.error('Error creating branding:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to create branding settings', 500);
  }
};

/**
 * DELETE /api/v1/branding
 * Reset branding to defaults
 * 
 * Query params:
 * - organizationId: Organization ID
 */
export const DELETE: APIRoute = async ({ url, request }) => {
  try {
    const session = await requireAuth(request);
    if (!session) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    }

    const organizationId = url.searchParams.get('organizationId');
    if (!organizationId) {
      return errorResponse('VALIDATION_ERROR', 'Organization ID is required', 400);
    }

    // Verify user is organization admin
    const isAdmin = await requireOrganizationAdmin(session.user.id, parseInt(organizationId, 10));
    if (!isAdmin) {
      return errorResponse('FORBIDDEN', 'Admin access required', 403);
    }

    await resetTheme(parseInt(organizationId, 10), session.user.id);

    return successResponse({ message: 'Branding reset to defaults' });
  } catch (error) {
    console.error('Error resetting branding:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to reset branding settings', 500);
  }
};

/**
 * OPTIONS /api/v1/branding
 * Handle CORS preflight
 */
export const OPTIONS: APIRoute = async () => {
  return handleCors();
};

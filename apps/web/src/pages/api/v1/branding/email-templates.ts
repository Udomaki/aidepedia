import type { APIRoute } from 'astro';
import { db, eq, and } from '@aidepedia/db';
import { email_templates, organization_members } from '@aidepedia/db/schema';
import {
  successResponse,
  errorResponse,
  handleCors,
  requireAuth,
  requireOrganizationAdmin
} from '../../../../lib/api-utils';

/**
 * GET /api/v1/branding/email-templates
 * Get email templates for an organization
 * 
 * Query params:
 * - organizationId: Organization ID
 * - type: Filter by template type (optional)
 */
export const GET: APIRoute = async ({ url, request }) => {
  try {
    const session = await requireAuth(request);
    if (!session) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    }

    const organizationId = url.searchParams.get('organizationId');
    const type = url.searchParams.get('type');

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

    // Build query
    let query = db
      .select()
      .from(email_templates)
      .where(eq(email_templates.organizationId, parseInt(organizationId, 10)));

    if (type) {
      query = query.where(
        and(
          eq(email_templates.organizationId, parseInt(organizationId, 10)),
          eq(email_templates.type, type as any)
        )
      );
    }

    const templates = await query;

    return successResponse(templates);
  } catch (error) {
    console.error('Error fetching email templates:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to fetch email templates', 500);
  }
};

/**
 * POST /api/v1/branding/email-templates
 * Create a new email template
 * 
 * Body:
 * - organizationId: Organization ID
 * - template: Template data
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    const session = await requireAuth(request);
    if (!session) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    }

    const body = await request.json();
    const { organizationId, template } = body;

    if (!organizationId || !template) {
      return errorResponse('VALIDATION_ERROR', 'Organization ID and template are required', 400);
    }

    // Verify user is organization admin
    const isAdmin = await requireOrganizationAdmin(session.user.id, organizationId);
    if (!isAdmin) {
      return errorResponse('FORBIDDEN', 'Admin access required', 403);
    }

    // Validate required fields
    if (!template.name || !template.type || !template.subject || !template.htmlContent) {
      return errorResponse('VALIDATION_ERROR', 'Missing required fields: name, type, subject, htmlContent', 400);
    }

    // Create template
    const [newTemplate] = await db
      .insert(email_templates)
      .values({
        organizationId: parseInt(organizationId, 10),
        name: template.name,
        type: template.type,
        subject: template.subject,
        htmlContent: template.htmlContent,
        textContent: template.textContent,
        headerLogo: template.headerLogo,
        backgroundColor: template.backgroundColor || '#F3F4F6',
        accentColor: template.accentColor || '#3B82F6',
        textColor: template.textColor || '#1F2937',
        footerText: template.footerText,
        showUnsubscribeLink: template.showUnsubscribeLink ?? true,
        isDefault: template.isDefault || false,
        isActive: template.isActive ?? true,
      })
      .returning();

    return successResponse(newTemplate, 201);
  } catch (error) {
    console.error('Error creating email template:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to create email template', 500);
  }
};

/**
 * PUT /api/v1/branding/email-templates
 * Update an email template
 * 
 * Body:
 * - organizationId: Organization ID
 * - templateId: Template ID
 * - template: Template data to update
 */
export const PUT: APIRoute = async ({ request }) => {
  try {
    const session = await requireAuth(request);
    if (!session) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    }

    const body = await request.json();
    const { organizationId, templateId, template } = body;

    if (!organizationId || !templateId || !template) {
      return errorResponse('VALIDATION_ERROR', 'Organization ID, template ID, and template are required', 400);
    }

    // Verify user is organization admin
    const isAdmin = await requireOrganizationAdmin(session.user.id, organizationId);
    if (!isAdmin) {
      return errorResponse('FORBIDDEN', 'Admin access required', 403);
    }

    // Verify template belongs to organization
    const [existing] = await db
      .select()
      .from(email_templates)
      .where(
        and(
          eq(email_templates.id, parseInt(templateId, 10)),
          eq(email_templates.organizationId, parseInt(organizationId, 10))
        )
      )
      .limit(1);

    if (!existing) {
      return errorResponse('NOT_FOUND', 'Template not found', 404);
    }

    // Update template
    const updateData: any = {
      updatedAt: new Date(),
    };

    if (template.name) updateData.name = template.name;
    if (template.subject) updateData.subject = template.subject;
    if (template.htmlContent) updateData.htmlContent = template.htmlContent;
    if (template.textContent !== undefined) updateData.textContent = template.textContent;
    if (template.headerLogo !== undefined) updateData.headerLogo = template.headerLogo;
    if (template.backgroundColor) updateData.backgroundColor = template.backgroundColor;
    if (template.accentColor) updateData.accentColor = template.accentColor;
    if (template.textColor) updateData.textColor = template.textColor;
    if (template.footerText !== undefined) updateData.footerText = template.footerText;
    if (template.showUnsubscribeLink !== undefined) updateData.showUnsubscribeLink = template.showUnsubscribeLink;
    if (template.isDefault !== undefined) updateData.isDefault = template.isDefault;
    if (template.isActive !== undefined) updateData.isActive = template.isActive;

    const [updated] = await db
      .update(email_templates)
      .set(updateData)
      .where(eq(email_templates.id, parseInt(templateId, 10)))
      .returning();

    return successResponse(updated);
  } catch (error) {
    console.error('Error updating email template:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to update email template', 500);
  }
};

/**
 * DELETE /api/v1/branding/email-templates
 * Delete an email template
 * 
 * Query params:
 * - organizationId: Organization ID
 * - templateId: Template ID
 */
export const DELETE: APIRoute = async ({ url, request }) => {
  try {
    const session = await requireAuth(request);
    if (!session) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    }

    const organizationId = url.searchParams.get('organizationId');
    const templateId = url.searchParams.get('templateId');

    if (!organizationId || !templateId) {
      return errorResponse('VALIDATION_ERROR', 'Organization ID and template ID are required', 400);
    }

    // Verify user is organization admin
    const isAdmin = await requireOrganizationAdmin(session.user.id, parseInt(organizationId, 10));
    if (!isAdmin) {
      return errorResponse('FORBIDDEN', 'Admin access required', 403);
    }

    // Verify template belongs to organization
    const [existing] = await db
      .select()
      .from(email_templates)
      .where(
        and(
          eq(email_templates.id, parseInt(templateId, 10)),
          eq(email_templates.organizationId, parseInt(organizationId, 10))
        )
      )
      .limit(1);

    if (!existing) {
      return errorResponse('NOT_FOUND', 'Template not found', 404);
    }

    await db
      .delete(email_templates)
      .where(eq(email_templates.id, parseInt(templateId, 10)));

    return successResponse({ message: 'Template deleted successfully' });
  } catch (error) {
    console.error('Error deleting email template:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to delete email template', 500);
  }
};

/**
 * OPTIONS /api/v1/branding/email-templates
 * Handle CORS preflight
 */
export const OPTIONS: APIRoute = async () => {
  return handleCors();
};

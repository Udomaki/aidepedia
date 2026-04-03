import type { APIRoute } from 'astro';
import { db, eq, and } from '@aidepedia/db';
import { organization_members } from '@aidepedia/db/schema';
import {
  addCustomDomain,
  verifyDomain,
  setPrimaryDomain,
  removeDomain,
  getOrganizationDomains,
  getDNSInstructions,
  checkDomainHealth,
  type CustomDomain
} from '../../../../lib/custom-domains';
import {
  successResponse,
  errorResponse,
  handleCors,
  requireAuth,
  requireOrganizationAdmin
} from '../../../../lib/api-utils';

/**
 * GET /api/v1/branding/domains
 * Get all custom domains for an organization
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

    const domains = await getOrganizationDomains(parseInt(organizationId, 10));

    return successResponse(domains);
  } catch (error) {
    console.error('Error fetching domains:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to fetch domains', 500);
  }
};

/**
 * POST /api/v1/branding/domains
 * Add a new custom domain
 * 
 * Body:
 * - organizationId: Organization ID
 * - domain: Domain name to add
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    const session = await requireAuth(request);
    if (!session) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    }

    const body = await request.json();
    const { organizationId, domain } = body;

    if (!organizationId || !domain) {
      return errorResponse('VALIDATION_ERROR', 'Organization ID and domain are required', 400);
    }

    // Verify user is organization admin
    const isAdmin = await requireOrganizationAdmin(session.user.id, organizationId);
    if (!isAdmin) {
      return errorResponse('FORBIDDEN', 'Admin access required', 403);
    }

    const newDomain = await addCustomDomain(
      parseInt(organizationId, 10),
      domain,
      session.user.id
    );

    // Include DNS instructions
    const instructions = getDNSInstructions(newDomain);

    return successResponse({
      domain: newDomain,
      instructions
    }, 201);
  } catch (error) {
    console.error('Error adding domain:', error);
    
    if (error instanceof Error) {
      if (error.message === 'Domain already registered') {
        return errorResponse('CONFLICT', error.message, 409);
      }
      if (error.message === 'Invalid domain format') {
        return errorResponse('VALIDATION_ERROR', error.message, 400);
      }
    }
    
    return errorResponse('INTERNAL_ERROR', 'Failed to add domain', 500);
  }
};

/**
 * PUT /api/v1/branding/domains
 * Verify or set primary domain
 * 
 * Body:
 * - organizationId: Organization ID
 * - domainId: Domain ID
 * - action: 'verify' | 'setPrimary'
 */
export const PUT: APIRoute = async ({ request }) => {
  try {
    const session = await requireAuth(request);
    if (!session) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    }

    const body = await request.json();
    const { organizationId, domainId, action } = body;

    if (!organizationId || !domainId || !action) {
      return errorResponse('VALIDATION_ERROR', 'Organization ID, domain ID, and action are required', 400);
    }

    // Verify user is organization admin
    const isAdmin = await requireOrganizationAdmin(session.user.id, organizationId);
    if (!isAdmin) {
      return errorResponse('FORBIDDEN', 'Admin access required', 403);
    }

    switch (action) {
      case 'verify':
        const verified = await verifyDomain(parseInt(domainId, 10), session.user.id);
        return successResponse({
          verified,
          message: verified ? 'Domain verified successfully' : 'Domain verification failed'
        });

      case 'setPrimary':
        await setPrimaryDomain(parseInt(organizationId, 10), parseInt(domainId, 10), session.user.id);
        return successResponse({ message: 'Primary domain updated successfully' });

      default:
        return errorResponse('VALIDATION_ERROR', 'Invalid action', 400);
    }
  } catch (error) {
    console.error('Error updating domain:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to update domain', 500);
  }
};

/**
 * DELETE /api/v1/branding/domains
 * Remove a custom domain
 * 
 * Query params:
 * - organizationId: Organization ID
 * - domainId: Domain ID
 */
export const DELETE: APIRoute = async ({ url, request }) => {
  try {
    const session = await requireAuth(request);
    if (!session) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    }

    const organizationId = url.searchParams.get('organizationId');
    const domainId = url.searchParams.get('domainId');

    if (!organizationId || !domainId) {
      return errorResponse('VALIDATION_ERROR', 'Organization ID and domain ID are required', 400);
    }

    // Verify user is organization admin
    const isAdmin = await requireOrganizationAdmin(session.user.id, parseInt(organizationId, 10));
    if (!isAdmin) {
      return errorResponse('FORBIDDEN', 'Admin access required', 403);
    }

    await removeDomain(parseInt(domainId, 10), session.user.id);

    return successResponse({ message: 'Domain removed successfully' });
  } catch (error) {
    console.error('Error removing domain:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to remove domain', 500);
  }
};

/**
 * OPTIONS /api/v1/branding/domains
 * Handle CORS preflight
 */
export const OPTIONS: APIRoute = async () => {
  return handleCors();
};

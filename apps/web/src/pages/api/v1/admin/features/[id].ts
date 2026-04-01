import type { APIRoute } from 'astro';
import { getSession } from '../../../../../lib/auth';
import { db } from '@aidepedia/db';
import { feature_flags } from '@aidepedia/db/schema';
import { successResponse, errorResponse } from '../../../../../lib/api-utils';
import { logAuditEntry, AuditActions, ResourceTypes } from '../../../../../lib/audit';
import { eq } from '@aidepedia/db';

/**
 * GET /api/v1/admin/features/[id]
 * Get a single feature flag (admin only)
 */
export const GET: APIRoute = async ({ request, params }) => {
  try {
    // Check authentication
    const session = await getSession(request);
    if (!session?.user?.email) {
      return errorResponse('UNAUTHORIZED', 'You must be logged in', 401);
    }

    const flagId = parseInt(params.id as string, 10);
    if (isNaN(flagId)) {
      return errorResponse('VALIDATION_ERROR', 'Invalid feature flag ID', 400);
    }

    const [flag] = await db
      .select()
      .from(feature_flags)
      .where(eq(feature_flags.id, flagId))
      .limit(1);

    if (!flag) {
      return errorResponse('NOT_FOUND', 'Feature flag not found', 404);
    }

    return successResponse(flag);
  } catch (error) {
    console.error('Get feature flag error:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to get feature flag', 500);
  }
};

/**
 * PUT /api/v1/admin/features/[id]
 * Update a feature flag (admin only)
 */
export const PUT: APIRoute = async ({ request, params }) => {
  try {
    // Check authentication
    const session = await getSession(request);
    if (!session?.user?.email) {
      return errorResponse('UNAUTHORIZED', 'You must be logged in', 401);
    }

    const flagId = parseInt(params.id as string, 10);
    if (isNaN(flagId)) {
      return errorResponse('VALIDATION_ERROR', 'Invalid feature flag ID', 400);
    }

    // Check if flag exists
    const [existing] = await db
      .select()
      .from(feature_flags)
      .where(eq(feature_flags.id, flagId))
      .limit(1);

    if (!existing) {
      return errorResponse('NOT_FOUND', 'Feature flag not found', 404);
    }

    const body = await request.json();
    const { name, description, enabled, rolloutPercentage } = body;

    // Validate rollout percentage if provided
    if (rolloutPercentage !== undefined) {
      if (typeof rolloutPercentage !== 'number' || rolloutPercentage < 0 || rolloutPercentage > 100) {
        return errorResponse('VALIDATION_ERROR', 'Rollout percentage must be between 0 and 100', 400);
      }
    }

    // Check if new name conflicts with existing flag
    if (name && name !== existing.name) {
      const [nameConflict] = await db
        .select()
        .from(feature_flags)
        .where(eq(feature_flags.name, name))
        .limit(1);

      if (nameConflict) {
        return errorResponse('VALIDATION_ERROR', 'Feature flag with this name already exists', 400);
      }
    }

    // Update feature flag
    const [updated] = await db
      .update(feature_flags)
      .set({
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(enabled !== undefined && { enabled }),
        ...(rolloutPercentage !== undefined && { rolloutPercentage }),
        updatedAt: new Date(),
      })
      .where(eq(feature_flags.id, flagId))
      .returning();

    // Log audit entry
    await logAuditEntry({
      userId: (session.user as any)?.id,
      action: AuditActions.FEATURE_FLAG_UPDATED,
      resourceType: ResourceTypes.FEATURE_FLAG,
      resourceId: String(flagId),
      details: {
        changes: { name, description, enabled, rolloutPercentage },
        previous: {
          name: existing.name,
          enabled: existing.enabled,
          rolloutPercentage: existing.rolloutPercentage,
        },
      },
      request,
    });

    return successResponse(updated);
  } catch (error) {
    console.error('Update feature flag error:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to update feature flag', 500);
  }
};

/**
 * DELETE /api/v1/admin/features/[id]
 * Delete a feature flag (admin only)
 */
export const DELETE: APIRoute = async ({ request, params }) => {
  try {
    // Check authentication
    const session = await getSession(request);
    if (!session?.user?.email) {
      return errorResponse('UNAUTHORIZED', 'You must be logged in', 401);
    }

    const flagId = parseInt(params.id as string, 10);
    if (isNaN(flagId)) {
      return errorResponse('VALIDATION_ERROR', 'Invalid feature flag ID', 400);
    }

    // Check if flag exists
    const [existing] = await db
      .select()
      .from(feature_flags)
      .where(eq(feature_flags.id, flagId))
      .limit(1);

    if (!existing) {
      return errorResponse('NOT_FOUND', 'Feature flag not found', 404);
    }

    // Delete feature flag
    await db.delete(feature_flags).where(eq(feature_flags.id, flagId));

    // Log audit entry
    await logAuditEntry({
      userId: (session.user as any)?.id,
      action: AuditActions.FEATURE_FLAG_DELETED,
      resourceType: ResourceTypes.FEATURE_FLAG,
      resourceId: String(flagId),
      details: { name: existing.name },
      request,
    });

    return successResponse({ deleted: true });
  } catch (error) {
    console.error('Delete feature flag error:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to delete feature flag', 500);
  }
};

/**
 * OPTIONS /api/v1/admin/features/[id]
 * Handle CORS preflight
 */
export const OPTIONS: APIRoute = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
};

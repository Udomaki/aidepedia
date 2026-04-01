import type { APIRoute } from 'astro';
import { getSession } from '../../../../../lib/auth';
import { db } from '@aidepedia/db';
import { feature_flags } from '@aidepedia/db/schema';
import { successResponse, errorResponse } from '../../../../../lib/api-utils';
import { logAuditEntry, AuditActions, ResourceTypes } from '../../../../../lib/audit';
import { eq } from '@aidepedia/db';

/**
 * GET /api/v1/admin/features
 * List all feature flags (admin view with full details)
 */
export const GET: APIRoute = async ({ request }) => {
  try {
    // Check authentication
    const session = await getSession(request);
    if (!session?.user?.email) {
      return errorResponse('UNAUTHORIZED', 'You must be logged in', 401);
    }

    const flags = await db
      .select()
      .from(feature_flags)
      .orderBy(feature_flags.createdAt);

    return successResponse(flags);
  } catch (error) {
    console.error('List feature flags error:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to fetch feature flags', 500);
  }
};

/**
 * POST /api/v1/admin/features
 * Create a new feature flag (admin only)
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    // Check authentication
    const session = await getSession(request);
    if (!session?.user?.email) {
      return errorResponse('UNAUTHORIZED', 'You must be logged in', 401);
    }

    const body = await request.json();
    const { name, description, enabled, rolloutPercentage } = body;

    // Validate required fields
    if (!name || typeof name !== 'string') {
      return errorResponse('VALIDATION_ERROR', 'Name is required', 400);
    }

    // Validate rollout percentage
    const percentage = rolloutPercentage ?? 0;
    if (typeof percentage !== 'number' || percentage < 0 || percentage > 100) {
      return errorResponse('VALIDATION_ERROR', 'Rollout percentage must be between 0 and 100', 400);
    }

    // Check if flag with this name already exists
    const [existing] = await db
      .select()
      .from(feature_flags)
      .where(eq(feature_flags.name, name))
      .limit(1);

    if (existing) {
      return errorResponse('VALIDATION_ERROR', 'Feature flag with this name already exists', 400);
    }

    // Create feature flag
    const [flag] = await db
      .insert(feature_flags)
      .values({
        name,
        description: description || null,
        enabled: enabled ?? false,
        rolloutPercentage: percentage,
      })
      .returning();

    // Log audit entry
    await logAuditEntry({
      userId: (session.user as any)?.id,
      action: AuditActions.FEATURE_FLAG_CREATED,
      resourceType: ResourceTypes.FEATURE_FLAG,
      resourceId: String(flag.id),
      details: {
        name,
        description,
        enabled: flag.enabled,
        rolloutPercentage: flag.rolloutPercentage,
      },
      request,
    });

    return successResponse(flag, undefined, 201);
  } catch (error) {
    console.error('Create feature flag error:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to create feature flag', 500);
  }
};

/**
 * OPTIONS /api/v1/admin/features
 * Handle CORS preflight
 */
export const OPTIONS: APIRoute = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
};

import type { APIRoute } from 'astro';
import { db } from '@aidepedia/db';
import { feature_flags } from '@aidepedia/db/schema';
import { successResponse, errorResponse } from '../../../../lib/api-utils';

/**
 * GET /api/v1/features
 * List all feature flags
 */
export const GET: APIRoute = async () => {
  try {
    const flags = await db
      .select({
        id: feature_flags.id,
        name: feature_flags.name,
        description: feature_flags.description,
        enabled: feature_flags.enabled,
        rolloutPercentage: feature_flags.rolloutPercentage,
      })
      .from(feature_flags);

    return successResponse(flags);
  } catch (error) {
    console.error('List feature flags error:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to fetch feature flags', 500);
  }
};

/**
 * OPTIONS /api/v1/features
 * Handle CORS preflight
 */
export const OPTIONS: APIRoute = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
};

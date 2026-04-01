import type { APIRoute } from 'astro';
import {
  createExperiment,
  listExperiments,
} from '@aidepedia/db';
import {
  successResponse,
  errorResponse,
  handleCors,
  getPaginationParams,
} from '../../../../../lib/api-utils';
import { getSession } from '../../../../../lib/auth';

/**
 * GET /api/v1/admin/experiments
 * List all experiments (admin view with full details)
 * 
 * Query params:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 20, max: 100)
 * - status: Filter by status
 */
export const GET: APIRoute = async ({ url, request }) => {
  try {
    // Check authentication
    const session = await getSession(request);
    if (!session?.user?.id) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401, request);
    }

    const { page, limit } = getPaginationParams(url);
    const status = url.searchParams.get('status');

    const params: any = {
      page,
      limit,
    };

    if (status) {
      params.status = status;
    }

    const result = await listExperiments(params);

    return successResponse(result.data, {
      total: result.meta.total,
      page: result.meta.page,
      limit: result.meta.limit,
      totalPages: result.meta.totalPages,
    }, 200, request);
  } catch (error) {
    console.error('Error fetching experiments:', error);
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to fetch experiments',
      500,
      request
    );
  }
};

/**
 * POST /api/v1/admin/experiments
 * Create a new experiment
 * 
 * Body:
 * - name: string (required)
 * - description: string (optional)
 * - variants: Array<{ name: string; weight: number }> (required)
 * - status: 'draft' | 'running' | 'paused' | 'completed' (optional, default: 'draft')
 * - startDate: Date (optional)
 * - endDate: Date (optional)
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    // Check authentication
    const session = await getSession(request);
    if (!session?.user?.id) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401, request);
    }

    const body = await request.json();
    const { name, description, variants, status, startDate, endDate } = body;

    // Validate required fields
    if (!name) {
      return errorResponse('VALIDATION_ERROR', 'name is required', 400, request);
    }

    if (!variants || !Array.isArray(variants) || variants.length < 2) {
      return errorResponse('VALIDATION_ERROR', 'At least 2 variants are required', 400, request);
    }

    // Validate variants
    for (const variant of variants) {
      if (!variant.name || typeof variant.weight !== 'number') {
        return errorResponse(
          'VALIDATION_ERROR',
          'Each variant must have a name and weight',
          400,
          request
        );
      }
      if (variant.weight <= 0) {
        return errorResponse(
          'VALIDATION_ERROR',
          'Variant weights must be positive numbers',
          400,
          request
        );
      }
    }

    // Validate dates
    const experimentData: any = {
      name,
      description,
      variants,
      status: status || 'draft',
    };

    if (startDate) {
      const parsedStartDate = new Date(startDate);
      if (isNaN(parsedStartDate.getTime())) {
        return errorResponse('VALIDATION_ERROR', 'Invalid startDate', 400, request);
      }
      experimentData.startDate = parsedStartDate;
    }

    if (endDate) {
      const parsedEndDate = new Date(endDate);
      if (isNaN(parsedEndDate.getTime())) {
        return errorResponse('VALIDATION_ERROR', 'Invalid endDate', 400, request);
      }
      experimentData.endDate = parsedEndDate;
    }

    const experiment = await createExperiment(experimentData);

    return successResponse(experiment, null, 201, request);
  } catch (error) {
    console.error('Error creating experiment:', error);
    
    if (error instanceof Error && error.message.includes('already exists')) {
      return errorResponse('VALIDATION_ERROR', 'Experiment with this name already exists', 400, request);
    }
    
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to create experiment',
      500,
      request
    );
  }
};

/**
 * Handle OPTIONS for CORS preflight
 */
export const OPTIONS: APIRoute = async () => {
  return handleCors();
};

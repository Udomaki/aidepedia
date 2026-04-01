import type { APIRoute } from 'astro';
import {
  getExperimentById,
  updateExperiment,
  deleteExperiment,
  getExperimentResults,
} from '@aidepedia/db';
import {
  successResponse,
  errorResponse,
  handleCors,
} from '../../../../../lib/api-utils';
import { getSession } from '../../../../../lib/auth';

/**
 * GET /api/v1/admin/experiments/[id]
 * Get experiment details with stats
 */
export const GET: APIRoute = async ({ request, params }) => {
  try {
    // Check authentication
    const session = await getSession(request);
    if (!session?.user?.id) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401, request);
    }

    const experimentId = parseInt(params.id, 10);

    if (isNaN(experimentId)) {
      return errorResponse('VALIDATION_ERROR', 'Invalid experiment ID', 400, request);
    }

    // Check if requesting results
    const url = new URL(request.url);
    const includeResults = url.searchParams.get('results') === 'true';

    if (includeResults) {
      const results = await getExperimentResults(experimentId);
      return successResponse(results, null, 200, request);
    }

    const experiment = await getExperimentById(experimentId);
    return successResponse(experiment, null, 200, request);
  } catch (error) {
    console.error('Error fetching experiment:', error);
    
    if (error instanceof Error && error.message.includes('not found')) {
      return errorResponse('NOT_FOUND', 'Experiment not found', 404, request);
    }
    
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to fetch experiment',
      500,
      request
    );
  }
};

/**
 * PUT /api/v1/admin/experiments/[id]
 * Update an experiment
 * 
 * Body:
 * - name: string (optional)
 * - description: string (optional)
 * - variants: Array<{ name: string; weight: number }> (optional)
 * - status: 'draft' | 'running' | 'paused' | 'completed' (optional)
 * - startDate: Date (optional)
 * - endDate: Date (optional)
 */
export const PUT: APIRoute = async ({ request, params }) => {
  try {
    // Check authentication
    const session = await getSession(request);
    if (!session?.user?.id) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401, request);
    }

    const experimentId = parseInt(params.id, 10);

    if (isNaN(experimentId)) {
      return errorResponse('VALIDATION_ERROR', 'Invalid experiment ID', 400, request);
    }

    const body = await request.json();
    const { name, description, variants, status, startDate, endDate } = body;

    // Build update data
    const updateData: any = {};

    if (name !== undefined) {
      updateData.name = name;
    }

    if (description !== undefined) {
      updateData.description = description;
    }

    if (variants !== undefined) {
      if (!Array.isArray(variants) || variants.length < 2) {
        return errorResponse('VALIDATION_ERROR', 'At least 2 variants are required', 400, request);
      }

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

      updateData.variants = variants;
    }

    if (status !== undefined) {
      if (!['draft', 'running', 'paused', 'completed'].includes(status)) {
        return errorResponse('VALIDATION_ERROR', 'Invalid status', 400, request);
      }
      updateData.status = status;
    }

    if (startDate !== undefined) {
      const parsedStartDate = new Date(startDate);
      if (isNaN(parsedStartDate.getTime())) {
        return errorResponse('VALIDATION_ERROR', 'Invalid startDate', 400, request);
      }
      updateData.startDate = parsedStartDate;
    }

    if (endDate !== undefined) {
      const parsedEndDate = new Date(endDate);
      if (isNaN(parsedEndDate.getTime())) {
        return errorResponse('VALIDATION_ERROR', 'Invalid endDate', 400, request);
      }
      updateData.endDate = parsedEndDate;
    }

    const experiment = await updateExperiment(experimentId, updateData);

    return successResponse(experiment, null, 200, request);
  } catch (error) {
    console.error('Error updating experiment:', error);
    
    if (error instanceof Error && error.message.includes('not found')) {
      return errorResponse('NOT_FOUND', 'Experiment not found', 404, request);
    }
    
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to update experiment',
      500,
      request
    );
  }
};

/**
 * DELETE /api/v1/admin/experiments/[id]
 * Delete an experiment
 */
export const DELETE: APIRoute = async ({ request, params }) => {
  try {
    // Check authentication
    const session = await getSession(request);
    if (!session?.user?.id) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401, request);
    }

    const experimentId = parseInt(params.id, 10);

    if (isNaN(experimentId)) {
      return errorResponse('VALIDATION_ERROR', 'Invalid experiment ID', 400, request);
    }

    await deleteExperiment(experimentId);

    return successResponse({ success: true }, null, 200, request);
  } catch (error) {
    console.error('Error deleting experiment:', error);
    
    if (error instanceof Error && error.message.includes('not found')) {
      return errorResponse('NOT_FOUND', 'Experiment not found', 404, request);
    }
    
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to delete experiment',
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

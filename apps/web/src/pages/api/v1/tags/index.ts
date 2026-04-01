import type { APIRoute } from 'astro';
import { getTags, createTag } from '@aidepedia/db';
import { 
  successResponse, 
  errorResponse, 
  handleCors,
} from '../../../../lib/api-utils';

/**
 * GET /api/v1/tags
 * List all tags
 */
export const GET: APIRoute = async () => {
  try {
    const tags = await getTags();

    const tagData = tags.map(tag => ({
      id: tag.id,
      name: tag.name,
      slug: tag.slug,
      createdAt: tag.createdAt?.toISOString?.() || tag.createdAt,
    }));

    return successResponse(tagData, {
      total: tags.length,
    });
  } catch (error) {
    console.error('Error fetching tags:', error);
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to fetch tags',
      500
    );
  }
};

/**
 * POST /api/v1/tags
 * Create a new tag
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { name, slug } = body;

    if (!name || !slug) {
      return errorResponse(
        'VALIDATION_ERROR',
        'Name and slug are required',
        400
      );
    }

    const tag = await createTag({ name, slug });

    return successResponse({
      id: tag.id,
      name: tag.name,
      slug: tag.slug,
      createdAt: tag.createdAt?.toISOString?.() || tag.createdAt,
    }, undefined, 201);
  } catch (error) {
    console.error('Error creating tag:', error);
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to create tag',
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

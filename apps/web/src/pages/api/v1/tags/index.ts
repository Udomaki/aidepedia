import type { APIRoute } from 'astro';
import { 
  getTagsWithAnalytics,
  createTag,
} from '@aidepedia/db';
import { generateTagSlug } from '../../../../lib/tagging';
import { 
  successResponse, 
  errorResponse, 
  handleCors,
} from '../../../../lib/api-utils';

/**
 * GET /api/v1/tags
 * List all tags with analytics
 */
export const GET: APIRoute = async ({ url }) => {
  try {
    const tags = await getTagsWithAnalytics();

    const tagData = tags.map(tag => ({
      id: tag.id,
      name: tag.name,
      slug: tag.slug,
      description: tag.description,
      usageCount: tag.usageCount,
      articleCount: tag.articleCount,
      parentId: tag.parentId,
      createdAt: tag.createdAt,
      updatedAt: tag.updatedAt,
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
    const { name, description, parentId } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return errorResponse('VALIDATION_ERROR', 'Tag name is required', 400);
    }

    const slug = generateTagSlug(name);

    const tag = await createTag({
      name: name.trim(),
      slug,
      description: description?.trim() || null,
      parentId: parentId || null,
      usageCount: 0,
    });

    return successResponse({
      id: tag.id,
      name: tag.name,
      slug: tag.slug,
      description: tag.description,
      parentId: tag.parentId,
      createdAt: tag.createdAt,
    }, undefined, 201);
  } catch (error) {
    console.error('Error creating tag:', error);
    
    if (error instanceof Error && error.message.includes('duplicate')) {
      return errorResponse('VALIDATION_ERROR', 'Tag already exists', 400);
    }
    
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

import type { APIRoute } from 'astro';
import { 
  getArticleBySlug, 
  getArticleTags, 
  addTagToArticle, 
  removeTagFromArticle,
  getTagBySlug 
} from '@aidepedia/db';
import { 
  successResponse, 
  errorResponse, 
  handleCors,
} from '../../../../../lib/api-utils';

/**
 * GET /api/v1/articles/[slug]/tags
 * Get tags for an article
 */
export const GET: APIRoute = async ({ params }) => {
  try {
    const { slug } = params;

    if (!slug) {
      return errorResponse('VALIDATION_ERROR', 'Slug is required', 400);
    }

    // Get article
    const article = await getArticleBySlug(slug);
    
    // Get article tags
    const tags = await getArticleTags(article.id);

    const tagData = tags.map(tag => ({
      id: tag.id,
      name: tag.name,
      slug: tag.slug,
    }));

    return successResponse(tagData, {
      total: tags.length,
    });
  } catch (error) {
    console.error('Error fetching article tags:', error);
    
    if (error instanceof Error && error.message.includes('not found')) {
      return errorResponse('NOT_FOUND', 'Article not found', 404);
    }
    
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to fetch article tags',
      500
    );
  }
};

/**
 * POST /api/v1/articles/[slug]/tags
 * Add a tag to an article
 */
export const POST: APIRoute = async ({ params, request }) => {
  try {
    const { slug } = params;

    if (!slug) {
      return errorResponse('VALIDATION_ERROR', 'Slug is required', 400);
    }

    const body = await request.json();
    const { tagSlug } = body;

    if (!tagSlug) {
      return errorResponse('VALIDATION_ERROR', 'tagSlug is required', 400);
    }

    // Get article
    const article = await getArticleBySlug(slug);
    
    // Get tag
    const tag = await getTagBySlug(tagSlug);

    // Add tag to article
    await addTagToArticle(article.id, tag.id);

    return successResponse({
      message: 'Tag added successfully',
      tag: {
        id: tag.id,
        name: tag.name,
        slug: tag.slug,
      },
    }, undefined, 201);
  } catch (error) {
    console.error('Error adding tag to article:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        return errorResponse('NOT_FOUND', error.message, 404);
      }
      if (error.message.includes('already has this tag')) {
        return errorResponse('VALIDATION_ERROR', error.message, 400);
      }
    }
    
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to add tag to article',
      500
    );
  }
};

/**
 * DELETE /api/v1/articles/[slug]/tags
 * Remove a tag from an article
 */
export const DELETE: APIRoute = async ({ params, request }) => {
  try {
    const { slug } = params;

    if (!slug) {
      return errorResponse('VALIDATION_ERROR', 'Slug is required', 400);
    }

    const body = await request.json();
    const { tagSlug } = body;

    if (!tagSlug) {
      return errorResponse('VALIDATION_ERROR', 'tagSlug is required', 400);
    }

    // Get article
    const article = await getArticleBySlug(slug);
    
    // Get tag
    const tag = await getTagBySlug(tagSlug);

    // Remove tag from article
    await removeTagFromArticle(article.id, tag.id);

    return successResponse({
      message: 'Tag removed successfully',
    });
  } catch (error) {
    console.error('Error removing tag from article:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        return errorResponse('NOT_FOUND', error.message, 404);
      }
      if (error.message.includes('does not have this tag')) {
        return errorResponse('VALIDATION_ERROR', error.message, 400);
      }
    }
    
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to remove tag from article',
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

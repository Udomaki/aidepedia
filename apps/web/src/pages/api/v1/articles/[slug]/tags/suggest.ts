import type { APIRoute } from 'astro';
import { 
  getArticleBySlug, 
  getArticleTags,
  getTags,
  getCategories,
} from '@aidepedia/db';
import { suggestTagsAndCategory } from '../../../../../../lib/tagging';
import { 
  successResponse, 
  errorResponse, 
  handleCors,
} from '../../../../../../lib/api-utils';

/**
 * POST /api/v1/articles/[slug]/tags/suggest
 * Get AI-powered tag and category suggestions
 */
export const POST: APIRoute = async ({ params }) => {
  try {
    const { slug } = params;

    if (!slug) {
      return errorResponse('VALIDATION_ERROR', 'Slug is required', 400);
    }

    // Get article
    const article = await getArticleBySlug(slug);
    
    // Get existing tags for vocabulary
    const allTags = await getTags();
    const existingTagNames = allTags.map(t => t.name);

    // Get categories
    const categories = await getCategories();

    // Get AI suggestions
    const suggestions = await suggestTagsAndCategory(
      article.title,
      article.content,
      article.excerpt,
      existingTagNames,
      categories.map(c => ({ id: c.id, name: c.name, description: c.description }))
    );

    return successResponse({
      tags: suggestions.tags,
      category: suggestions.category,
    });
  } catch (error) {
    console.error('Error suggesting tags:', error);
    
    if (error instanceof Error && error.message.includes('not found')) {
      return errorResponse('NOT_FOUND', 'Article not found', 404);
    }
    
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to generate tag suggestions',
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

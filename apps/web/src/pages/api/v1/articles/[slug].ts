import type { APIRoute } from 'astro';
import { 
  getArticleBySlug, 
  getCategories,
  updateArticle,
  deleteArticle,
  getUserByUsername,
  createMentionNotifications,
} from '@aidepedia/db';
import { 
  successResponse, 
  errorResponse, 
  handleCors,
  transformArticleForApi
} from '../../../../lib/api-utils';
import { getSession } from '../../../../lib/auth';
import { parseMentions, extractUniqueUsernames } from '../../../../lib/mentions';

/**
 * GET /api/v1/articles/[slug]
 * Get a single article by slug
 * 
 * Returns full article details including content
 */
export const GET: APIRoute = async ({ params }) => {
  try {
    const { slug } = params;

    if (!slug) {
      return errorResponse('VALIDATION_ERROR', 'Slug is required', 400);
    }

    // Fetch article
    const article = await getArticleBySlug(slug);

    // Only return published articles via public API
    if (article.status !== 'published') {
      return errorResponse('NOT_FOUND', 'Article not found', 404);
    }

    // Fetch category name if available
    let categoryName: string | undefined;
    if (article.categoryId) {
      const categories = await getCategories();
      categoryName = categories.find(c => c.id === article.categoryId)?.name;
    }

    // Transform for API
    const articleData = transformArticleForApi(article, categoryName);

    return successResponse(articleData);
  } catch (error) {
    console.error('Error fetching article:', error);
    
    // Check if it's a not found error
    if (error instanceof Error && error.message.includes('not found')) {
      return errorResponse('NOT_FOUND', 'Article not found', 404);
    }
    
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to fetch article',
      500
    );
  }
};

/**
 * PUT /api/v1/articles/[slug]
 * Update an article
 */
export const PUT: APIRoute = async ({ params, request }) => {
  try {
    const { slug } = params;

    if (!slug) {
      return errorResponse('VALIDATION_ERROR', 'Slug is required', 400);
    }

    // Check authentication
    const session = await getSession(request);
    if (!session?.user?.id) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    }

    // Get existing article
    const article = await getArticleBySlug(slug);

    // Parse request body
    const body = await request.json();
    const { title, content, excerpt, categoryId, status, tags, slug: newSlug } = body;

    // Build updates
    const updates: Record<string, any> = {};
    
    if (title !== undefined) updates.title = title;
    if (content !== undefined) updates.content = content;
    if (excerpt !== undefined) updates.excerpt = excerpt;
    if (categoryId !== undefined) updates.categoryId = categoryId;
    if (status !== undefined) updates.status = status;
    if (tags !== undefined) updates.tags = tags;
    if (newSlug !== undefined && newSlug !== slug) updates.slug = newSlug;

    // Update article
    const editorId = parseInt(session.user.id as string, 10);
    const updated = await updateArticle(article.id, updates, editorId, 'Updated via web interface');

    // Handle @mentions in content if content was updated
    if (content !== undefined) {
      const mentions = parseMentions(content);
      const uniqueUsernames = extractUniqueUsernames(mentions);
      
      if (uniqueUsernames.length > 0) {
        // Resolve usernames to user IDs
        const userPromises = uniqueUsernames.map(async (username) => {
          try {
            const user = await getUserByUsername(username);
            return user;
          } catch (error) {
            // User not found, skip
            return null;
          }
        });
        const users = await Promise.all(userPromises);
        
        // Filter out non-existent users and the author themselves
        const mentionedUserIds = users
          .filter(user => user !== null && user.id !== editorId)
          .map(user => user!.id);
        
        if (mentionedUserIds.length > 0) {
          // Create mention notifications
          await createMentionNotifications(mentionedUserIds, {
            title: `You were mentioned in "${updated.title}"`,
            content: `You were mentioned in the article "${updated.title}"`,
            mentionedByUserId: editorId,
            articleId: updated.id,
            articleSlug: updated.slug,
          });
        }
      }
    }

    // Fetch category name if available
    let categoryName: string | undefined;
    if (updated.categoryId) {
      const categories = await getCategories();
      categoryName = categories.find(c => c.id === updated.categoryId)?.name;
    }

    return successResponse(transformArticleForApi(updated, categoryName));
  } catch (error) {
    console.error('Error updating article:', error);
    
    // Check for specific errors
    if (error instanceof Error && error.message.includes('not found')) {
      return errorResponse('NOT_FOUND', 'Article not found', 404);
    }
    
    if (error instanceof Error && error.message.includes('already exists')) {
      return errorResponse('VALIDATION_ERROR', error.message, 400);
    }
    
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to update article',
      500
    );
  }
};

/**
 * DELETE /api/v1/articles/[slug]
 * Delete an article (soft delete by setting status to rejected)
 */
export const DELETE: APIRoute = async ({ params, request }) => {
  try {
    const { slug } = params;

    if (!slug) {
      return errorResponse('VALIDATION_ERROR', 'Slug is required', 400);
    }

    // Check authentication
    const session = await getSession(request);
    if (!session?.user?.id) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    }

    // Get existing article
    const article = await getArticleBySlug(slug);

    // Delete article (soft delete)
    await deleteArticle(article.id);

    return successResponse({ deleted: true });
  } catch (error) {
    console.error('Error deleting article:', error);
    
    if (error instanceof Error && error.message.includes('not found')) {
      return errorResponse('NOT_FOUND', 'Article not found', 404);
    }
    
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to delete article',
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

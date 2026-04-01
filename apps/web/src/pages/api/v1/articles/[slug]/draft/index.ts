import type { APIRoute } from 'astro';
import { 
  successResponse, 
  errorResponse, 
  handleCors 
} from '../../../../../../lib/api-utils';
import { getSession } from '../../../../../../lib/auth';
import { 
  getArticleBySlug, 
  getArticleDraft, 
  saveArticleDraft, 
  deleteArticleDraft 
} from '@aidepedia/db';

/**
 * GET /api/v1/articles/[slug]/draft
 * Get the draft for an article for the current user
 */
export const GET: APIRoute = async ({ params, request }) => {
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

    const userId = parseInt(session.user.id as string, 10);
    if (isNaN(userId)) {
      return errorResponse('VALIDATION_ERROR', 'Invalid user ID', 400);
    }

    // Get article to find its ID
    let articleId: number | null = null;
    try {
      const article = await getArticleBySlug(slug);
      articleId = article.id;
    } catch (e) {
      // Article doesn't exist yet - this is okay for new articles
      // We'll use null as articleId for new article drafts
    }

    // Get draft
    const draft = await getArticleDraft(articleId, userId);

    return successResponse(draft);
  } catch (error) {
    console.error('Error fetching draft:', error);
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to fetch draft',
      500
    );
  }
};

/**
 * POST /api/v1/articles/[slug]/draft
 * Save a draft for an article
 */
export const POST: APIRoute = async ({ params, request }) => {
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

    const userId = parseInt(session.user.id as string, 10);
    if (isNaN(userId)) {
      return errorResponse('VALIDATION_ERROR', 'Invalid user ID', 400);
    }

    // Parse request body
    const body = await request.json();
    const { title, content, excerpt, tags } = body;

    // Get article to find its ID (if it exists)
    let articleId: number | null = null;
    try {
      const article = await getArticleBySlug(slug);
      articleId = article.id;
    } catch (e) {
      // Article doesn't exist yet - this is okay for new articles
    }

    // Save draft
    const draft = await saveArticleDraft(articleId, userId, {
      title,
      content,
      excerpt,
      tags,
    });

    return successResponse({
      ...draft,
      lastSaved: draft.lastSaved.toISOString(),
    });
  } catch (error) {
    console.error('Error saving draft:', error);
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to save draft',
      500
    );
  }
};

/**
 * DELETE /api/v1/articles/[slug]/draft
 * Discard a draft
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

    const userId = parseInt(session.user.id as string, 10);
    if (isNaN(userId)) {
      return errorResponse('VALIDATION_ERROR', 'Invalid user ID', 400);
    }

    // Get article to find its ID (if it exists)
    let articleId: number | null = null;
    try {
      const article = await getArticleBySlug(slug);
      articleId = article.id;
    } catch (e) {
      // Article doesn't exist yet
    }

    // Delete draft
    await deleteArticleDraft(articleId, userId);

    return successResponse({ deleted: true });
  } catch (error) {
    console.error('Error deleting draft:', error);
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to delete draft',
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

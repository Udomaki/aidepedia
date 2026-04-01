import type { APIRoute } from 'astro';
import { getArticleBySlug, getCommentsByArticle, createComment } from '@aidepedia/db';
import { getSession } from 'auth-astro/server';

export const prerender = false;

/**
 * GET /api/v1/articles/[slug]/comments
 * Get all comments for an article as a threaded tree
 */
export const GET: APIRoute = async ({ params }) => {
  try {
    const { slug } = params;

    if (!slug) {
      return new Response(JSON.stringify({ error: 'Slug is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get article to get its ID
    const article = await getArticleBySlug(slug);
    
    // Get comments as threaded tree
    const comments = await getCommentsByArticle(article.id);

    return new Response(JSON.stringify({ comments }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Get comments error:', error);
    
    if (error.name === 'NotFoundError') {
      return new Response(JSON.stringify({ error: 'Article not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(
      JSON.stringify({ error: error.message || 'Failed to get comments' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};

/**
 * POST /api/v1/articles/[slug]/comments
 * Create a new comment (requires authentication)
 */
export const POST: APIRoute = async ({ request, params }) => {
  try {
    const { slug } = params;

    if (!slug) {
      return new Response(JSON.stringify({ error: 'Slug is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Check authentication
    const session = await getSession(request);
    
    if (!session?.user?.id) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get article to get its ID
    const article = await getArticleBySlug(slug);

    // Parse request body
    const body = await request.json();
    const { parentId, content } = body;

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return new Response(JSON.stringify({ error: 'Content is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Create comment
    const comment = await createComment({
      articleId: article.id,
      userId: parseInt(session.user.id),
      parentId: parentId ? parseInt(parentId) : null,
      content: content.trim(),
    });

    return new Response(JSON.stringify({ comment }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Create comment error:', error);
    
    if (error.name === 'NotFoundError') {
      return new Response(JSON.stringify({ error: 'Article not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(
      JSON.stringify({ error: error.message || 'Failed to create comment' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};

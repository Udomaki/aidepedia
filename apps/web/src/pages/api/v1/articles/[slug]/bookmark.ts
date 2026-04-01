import type { APIRoute } from 'astro';
import { getArticleBySlug, addBookmark, removeBookmark, isBookmarked } from '@aidepedia/db';
import { getSession } from 'auth-astro/server';

export const prerender = false;

/**
 * POST /api/v1/articles/[slug]/bookmark
 * Bookmark an article (requires authentication)
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

    const article = await getArticleBySlug(slug);
    const userId = parseInt(session.user.id);

    await addBookmark(userId, article.id);

    return new Response(JSON.stringify({ bookmarked: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Add bookmark error:', error);
    
    if (error.name === 'NotFoundError') {
      return new Response(JSON.stringify({ error: 'Article not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(
      JSON.stringify({ error: error.message || 'Failed to add bookmark' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};

/**
 * DELETE /api/v1/articles/[slug]/bookmark
 * Remove a bookmark (requires authentication)
 */
export const DELETE: APIRoute = async ({ request, params }) => {
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

    const article = await getArticleBySlug(slug);
    const userId = parseInt(session.user.id);

    await removeBookmark(userId, article.id);

    return new Response(JSON.stringify({ bookmarked: false }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Remove bookmark error:', error);
    
    if (error.name === 'NotFoundError') {
      return new Response(JSON.stringify({ error: 'Article not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(
      JSON.stringify({ error: error.message || 'Failed to remove bookmark' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};

/**
 * GET /api/v1/articles/[slug]/bookmark
 * Check if article is bookmarked
 */
export const GET: APIRoute = async ({ request, params }) => {
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
      return new Response(JSON.stringify({ bookmarked: false }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const article = await getArticleBySlug(slug);
    const userId = parseInt(session.user.id);

    const bookmarked = await isBookmarked(userId, article.id);

    return new Response(JSON.stringify({ bookmarked }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Check bookmark error:', error);
    
    if (error.name === 'NotFoundError') {
      return new Response(JSON.stringify({ error: 'Article not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(
      JSON.stringify({ error: error.message || 'Failed to check bookmark' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};

import type { APIRoute } from 'astro';
import { getArticleBySlug, createEditSuggestion, getEditSuggestionsByArticle } from '@aidepedia/db';
import { getSession } from 'auth-astro/server';

export const prerender = false;

/**
 * GET /api/v1/articles/[slug]/suggestions
 * Get all edit suggestions for an article
 */
export const GET: APIRoute = async ({ params, url }) => {
  try {
    const { slug } = params;

    if (!slug) {
      return new Response(JSON.stringify({ error: 'Slug is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Verify article exists
    const article = await getArticleBySlug(slug);

    // Parse query params
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const limit = parseInt(url.searchParams.get('limit') || '20', 10);
    const status = url.searchParams.get('status') as 'pending' | 'approved' | 'rejected' | null;

    const result = await getEditSuggestionsByArticle(article.id, { page, limit, status: status || undefined });

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Get edit suggestions error:', error);
    
    if (error.name === 'NotFoundError') {
      return new Response(JSON.stringify({ error: 'Article not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(
      JSON.stringify({ error: error.message || 'Failed to fetch edit suggestions' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};

/**
 * POST /api/v1/articles/[slug]/suggestions
 * Submit a new edit suggestion
 */
export const POST: APIRoute = async ({ params, request }) => {
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
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Verify article exists
    const article = await getArticleBySlug(slug);

    // Parse request body
    const body = await request.json();
    const { fieldName, oldValue, newValue, reason } = body;

    // Validate required fields
    if (!fieldName || !newValue) {
      return new Response(JSON.stringify({ error: 'fieldName and newValue are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Validate fieldName
    const validFields = ['title', 'content', 'excerpt'];
    if (!validFields.includes(fieldName)) {
      return new Response(JSON.stringify({ error: `Invalid field name. Must be one of: ${validFields.join(', ')}` }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Create suggestion
    const suggestion = await createEditSuggestion({
      articleId: article.id,
      userId: parseInt(session.user.id),
      fieldName,
      oldValue,
      newValue,
      reason,
    });

    return new Response(JSON.stringify({ suggestion }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Create edit suggestion error:', error);
    
    if (error.name === 'NotFoundError') {
      return new Response(JSON.stringify({ error: 'Article not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(
      JSON.stringify({ error: error.message || 'Failed to create edit suggestion' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};

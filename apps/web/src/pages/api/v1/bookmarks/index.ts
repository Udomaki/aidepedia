import type { APIRoute } from 'astro';
import { getBookmarks } from '@aidepedia/db';
import { getSession } from 'auth-astro/server';

export const prerender = false;

/**
 * GET /api/v1/bookmarks
 * Get user's bookmarks (requires authentication)
 */
export const GET: APIRoute = async ({ request, url }) => {
  try {
    // Check authentication
    const session = await getSession(request);
    
    if (!session?.user?.id) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const userId = parseInt(session.user.id);
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '20');

    const result = await getBookmarks(userId, page, limit);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Get bookmarks error:', error);

    return new Response(
      JSON.stringify({ error: error.message || 'Failed to get bookmarks' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};

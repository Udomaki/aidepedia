import type { APIRoute } from 'astro';
import { collaborationService } from '../../../../../lib/collaboration-service';
import { getSession } from '../../../../../lib/auth';

export const GET: APIRoute = async ({ params, request, url }) => {
  try {
    const session = await getSession(request);
    if (!session?.user?.id) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const { slug } = params;
    const articleId = parseInt(slug || '0', 10);
    
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    const userIdParam = url.searchParams.get('userId');
    const userId = userIdParam ? parseInt(userIdParam, 10) : undefined;
    
    const history = await collaborationService.getCollaborationHistory(articleId, limit, userId);
    
    return new Response(JSON.stringify({ history }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error fetching history:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch history' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

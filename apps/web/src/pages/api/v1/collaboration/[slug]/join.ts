import type { APIRoute } from 'astro';
import { collaborationService } from '../../../../../lib/collaboration-service';
import { getSession } from '../../../../../lib/auth';

export const POST: APIRoute = async ({ params, request }) => {
  try {
    const session = await getSession(request);
    if (!session?.user?.id) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const { slug } = params;
    const userId = parseInt(session.user.id as string, 10);
    
    // Get article ID from slug (would need to query database)
    // For now, using slug as ID for simplicity
    const articleId = parseInt(slug || '0', 10);
    
    const sessionId = await collaborationService.joinSession(articleId, userId);
    
    return new Response(JSON.stringify({ 
      sessionId,
      message: 'Joined collaboration session' 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error joining session:', error);
    return new Response(JSON.stringify({ error: 'Failed to join session' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

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
    const body = await request.json();
    const { sessionId, cursorPosition, currentSection } = body;
    
    await collaborationService.updatePresence(sessionId, cursorPosition, currentSection);
    
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error updating presence:', error);
    return new Response(JSON.stringify({ error: 'Failed to update presence' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const GET: APIRoute = async ({ params, request }) => {
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
    
    const collaborators = await collaborationService.getActiveCollaborators(articleId);
    
    return new Response(JSON.stringify({ collaborators }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error fetching collaborators:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch collaborators' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

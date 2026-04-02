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
    const articleId = parseInt(slug || '0', 10);
    
    const body = await request.json();
    const { sectionName, sessionId, durationMinutes } = body;
    
    const result = await collaborationService.lockSection(
      articleId,
      sectionName,
      userId,
      sessionId,
      durationMinutes
    );
    
    return new Response(JSON.stringify(result), {
      status: result.success ? 200 : 409,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error locking section:', error);
    return new Response(JSON.stringify({ error: 'Failed to lock section' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const DELETE: APIRoute = async ({ params, request }) => {
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
    const articleId = parseInt(slug || '0', 10);
    
    const body = await request.json();
    const { sectionName, sessionId } = body;
    
    await collaborationService.unlockSection(articleId, sectionName, userId, sessionId);
    
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error unlocking section:', error);
    return new Response(JSON.stringify({ error: 'Failed to unlock section' }), {
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
    
    const locks = await collaborationService.getActiveLocks(articleId);
    
    return new Response(JSON.stringify({ locks }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error fetching locks:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch locks' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

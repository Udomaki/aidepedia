import type { APIRoute } from 'astro';
import { getSession } from 'auth-astro/server';
import { trackInteraction } from '../../../../lib/recommendations';

export const POST: APIRoute = async ({ request }) => {
  try {
    const session = await getSession(request);
    
    if (!session?.user?.id) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    const userId = parseInt(session.user.id);
    
    // Parse request body
    const body = await request.json();
    
    // Validate required fields
    if (!body.articleId) {
      return new Response(JSON.stringify({ error: 'articleId is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    if (!body.interactionType) {
      return new Response(JSON.stringify({ error: 'interactionType is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    // Validate interaction type
    const validTypes = ['view', 'read', 'bookmark', 'upvote', 'share', 'comment'];
    if (!validTypes.includes(body.interactionType)) {
      return new Response(JSON.stringify({ 
        error: 'Invalid interactionType',
        validTypes,
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    const articleId = parseInt(body.articleId);
    const interactionType = body.interactionType as 'view' | 'read' | 'bookmark' | 'upvote' | 'share' | 'comment';
    
    // Track the interaction
    await trackInteraction(userId, articleId, interactionType, {
      timeOnPage: body.timeOnPage,
      scrollDepth: body.scrollDepth,
      source: body.source,
    });
    
    return new Response(JSON.stringify({
      success: true,
      message: 'Interaction tracked successfully',
      data: {
        userId,
        articleId,
        interactionType,
        timestamp: new Date().toISOString(),
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error tracking interaction:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to track interaction',
      message: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

import type { APIRoute } from 'astro';
import { createUserAppeal, getAppeals, updateAppeal, createModerationAction, getUserModerationActions } from '@aidepedia/db';

export const GET: APIRoute = async ({ url, cookies }) => {
  try {
    // Get current user from session
    const session = cookies.get('authjs.session');
    if (!session) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const status = url.searchParams.get('status') || undefined;
    const appellantId = url.searchParams.get('appellantId') ? parseInt(url.searchParams.get('appellantId')!) : undefined;
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '20');

    const result = await getAppeals({
      status,
      appellantId,
      page,
      limit,
    });

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error fetching appeals:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Failed to fetch appeals' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    // Get current user from session
    const session = cookies.get('authjs.session');
    if (!session) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const data = await request.json();
    const { actionId, appealText, additionalEvidence, appellantId } = data;

    if (!actionId || !appealText || !appellantId) {
      return new Response(JSON.stringify({ 
        error: 'Missing required fields: actionId, appealText, appellantId' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Verify the user owns the action being appealed
    const userActions = await getUserModerationActions(appellantId);
    const action = userActions.find(a => a.id === actionId);
    
    if (!action) {
      return new Response(JSON.stringify({ 
        error: 'Action not found or does not belong to user' 
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Check if there's already a pending appeal for this action
    const existingAppeals = await getAppeals({ appellantId, status: 'pending' });
    const pendingAppeal = existingAppeals.data.find((a: any) => a.actionId === actionId);
    
    if (pendingAppeal) {
      return new Response(JSON.stringify({ 
        error: 'You already have a pending appeal for this action' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const appeal = await createUserAppeal({
      actionId,
      appellantId,
      appealText,
      additionalEvidence,
    });

    return new Response(JSON.stringify({ success: true, appeal }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error creating appeal:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Failed to create appeal' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const PATCH: APIRoute = async ({ request, cookies }) => {
  try {
    // Get current user from session - must be moderator
    const session = cookies.get('authjs.session');
    if (!session) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const data = await request.json();
    const { appealId, status, reviewNotes, outcome, modificationDetails, moderatorId } = data;

    if (!appealId) {
      return new Response(JSON.stringify({ 
        error: 'Missing required field: appealId' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Update the appeal
    const appeal = await updateAppeal(appealId, {
      status,
      reviewNotes,
      outcome,
      modificationDetails,
      reviewedBy: moderatorId,
    });

    // If appeal is approved, reverse the moderation action
    if (outcome === 'overturned' && appeal) {
      // Create reversal action
      await createModerationAction({
        actionType: 'content_restored',
        targetType: 'user', // or get from original action
        targetUserId: appeal.appellantId,
        reason: `Appeal approved: ${reviewNotes || 'No reason provided'}`,
        moderatorId,
      });
    }

    return new Response(JSON.stringify({ success: true, appeal }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error updating appeal:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Failed to update appeal' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

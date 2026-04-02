import type { APIRoute } from 'astro';
import { getSession } from '../../../../../lib/auth';
import {
  takeModerationAction,
  getModeratorRole,
  logModerationAction,
  getUserModerationActions,
} from '@aidepedia/db/queries';
import type { NewModerationAction } from '@aidepedia/db/types';

export const GET: APIRoute = async ({ request, url }) => {
  try {
    const session = await getSession(request);
    if (!session?.user?.id) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Check if user is a moderator
    const moderatorRole = await getModeratorRole(session.user.id);
    if (!moderatorRole) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const userId = parseInt(url.searchParams.get('userId') || '0');
    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'userId is required' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const actions = await getUserModerationActions(userId);
    return new Response(JSON.stringify(actions), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error fetching moderation actions:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to fetch moderation actions' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const session = await getSession(request);
    if (!session?.user?.id) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Check if user is a moderator
    const moderatorRole = await getModeratorRole(session.user.id);
    if (!moderatorRole) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await request.json();
    const { userId, actionType, reason, relatedFlagId, duration } = body;

    if (!userId || !actionType || !reason) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Check permissions based on action type
    if (actionType === 'temp_ban' && !['senior', 'admin'].includes(moderatorRole.role)) {
      return new Response(
        JSON.stringify({ error: 'Only senior moderators and admins can ban users' }),
        {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    if (actionType === 'perm_ban' && moderatorRole.role !== 'admin') {
      return new Response(
        JSON.stringify({ error: 'Only admins can permanently ban users' }),
        {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const actionData: NewModerationAction = {
      userId,
      actionType,
      reason,
      relatedFlagId,
      moderatorId: session.user.id,
      duration,
      expiresAt: duration ? new Date(Date.now() + duration * 60 * 60 * 1000) : null,
    };

    const action = await takeModerationAction(actionData);

    // Get client info for audit log
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip');
    const userAgent = request.headers.get('user-agent');

    await logModerationAction(
      session.user.id,
      `take_action_${actionType}`,
      'user',
      userId,
      { actionId: action.id, reason, duration },
      ip,
      userAgent
    );

    return new Response(JSON.stringify(action), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error taking moderation action:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to take moderation action' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};

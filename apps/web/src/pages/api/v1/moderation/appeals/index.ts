import type { APIRoute } from 'astro';
import { getSession } from '../../../../../lib/auth';
import {
  createAppeal,
  getAppeals,
  getModeratorRole,
  logModerationAction,
} from '@aidepedia/db/queries';
import type { NewModerationAppeal } from '@aidepedia/db/types';

export const GET: APIRoute = async ({ request, url }) => {
  try {
    const session = await getSession(request);
    if (!session?.user?.id) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Check if user is a senior moderator or admin
    const moderatorRole = await getModeratorRole(session.user.id);
    if (!moderatorRole || !['senior', 'admin'].includes(moderatorRole.role)) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const params = {
      status: url.searchParams.get('status') as any || undefined,
      page: parseInt(url.searchParams.get('page') || '1'),
      limit: parseInt(url.searchParams.get('limit') || '20'),
    };

    const result = await getAppeals(params);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error fetching appeals:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to fetch appeals' }),
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

    const body = await request.json();
    const { actionId, reason, evidence } = body;

    if (!actionId || !reason) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const appealData: NewModerationAppeal = {
      actionId,
      appellantId: session.user.id,
      reason,
      evidence,
    };

    const appeal = await createAppeal(appealData);

    // Get client info for audit log
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip');
    const userAgent = request.headers.get('user-agent');

    await logModerationAction(
      session.user.id,
      'create_appeal',
      'appeal',
      appeal.id,
      { actionId, reason },
      ip,
      userAgent
    );

    return new Response(JSON.stringify(appeal), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error creating appeal:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to create appeal' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};

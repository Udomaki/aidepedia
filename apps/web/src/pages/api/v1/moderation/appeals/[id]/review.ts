import type { APIRoute } from 'astro';
import { getSession } from '../../../../../../lib/auth';
import {
  reviewAppeal,
  getModeratorRole,
  logModerationAction,
} from '@aidepedia/db/queries';

export const POST: APIRoute = async ({ request, params }) => {
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

    const appealId = parseInt(params.id);
    if (isNaN(appealId)) {
      return new Response(JSON.stringify({ error: 'Invalid appeal ID' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await request.json();
    const { status, resolution } = body;

    if (!status || !['approved', 'rejected'].includes(status)) {
      return new Response(
        JSON.stringify({ error: 'Invalid status. Must be approved or rejected' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const appeal = await reviewAppeal(appealId, session.user.id, status, resolution);

    // Get client info for audit log
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip');
    const userAgent = request.headers.get('user-agent');

    await logModerationAction(
      session.user.id,
      `review_appeal_${status}`,
      'appeal',
      appealId,
      { resolution, actionId: appeal.actionId },
      ip,
      userAgent
    );

    return new Response(JSON.stringify(appeal), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error reviewing appeal:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to review appeal' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};

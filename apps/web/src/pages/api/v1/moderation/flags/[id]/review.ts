import type { APIRoute } from 'astro';
import { getSession } from '../../../../../../lib/auth';
import {
  reviewModerationFlag,
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

    // Check if user is a moderator
    const moderatorRole = await getModeratorRole(session.user.id);
    if (!moderatorRole) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const flagId = parseInt(params.id);
    if (isNaN(flagId)) {
      return new Response(JSON.stringify({ error: 'Invalid flag ID' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await request.json();
    const { status, resolution } = body;

    if (!status || !['approved', 'rejected', 'escalated'].includes(status)) {
      return new Response(
        JSON.stringify({ error: 'Invalid status. Must be approved, rejected, or escalated' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Only senior moderators and admins can escalate
    if (status === 'escalated' && !['senior', 'admin'].includes(moderatorRole.role)) {
      return new Response(
        JSON.stringify({ error: 'Only senior moderators and admins can escalate flags' }),
        {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const flag = await reviewModerationFlag(flagId, session.user.id, status, resolution);

    // Get client info for audit log
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip');
    const userAgent = request.headers.get('user-agent');

    await logModerationAction(
      session.user.id,
      `review_flag_${status}`,
      'flag',
      flagId,
      { resolution, flagStatus: status },
      ip,
      userAgent
    );

    return new Response(JSON.stringify(flag), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error reviewing moderation flag:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to review moderation flag' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};

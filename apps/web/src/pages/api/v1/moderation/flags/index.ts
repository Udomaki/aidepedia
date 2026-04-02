import type { APIRoute } from 'astro';
import { getSession } from '../../../../../lib/auth';
import {
  flagContent,
  getModerationFlags,
  getModeratorRole,
  logModerationAction,
} from '@aidepedia/db/queries';
import type { NewModerationFlag, ModerationFlagQueryParams } from '@aidepedia/db/types';

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

    const params: ModerationFlagQueryParams = {
      status: url.searchParams.get('status') as any || undefined,
      severity: url.searchParams.get('severity') as any || undefined,
      reason: url.searchParams.get('reason') as any || undefined,
      contentType: url.searchParams.get('contentType') as any || undefined,
      page: parseInt(url.searchParams.get('page') || '1'),
      limit: parseInt(url.searchParams.get('limit') || '20'),
    };

    const result = await getModerationFlags(params);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error fetching moderation flags:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to fetch moderation flags' }),
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
    const { contentType, contentId, reason, description, severity } = body;

    if (!contentType || !contentId || !reason) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const flagData: NewModerationFlag = {
      contentType,
      contentId,
      flaggedBy: session.user.id,
      reason,
      description,
      severity: severity || 'medium',
    };

    const flag = await flagContent(flagData);

    // Get client info for audit log
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip');
    const userAgent = request.headers.get('user-agent');

    await logModerationAction(
      session.user.id,
      'flag_content',
      contentType === 'article' ? 'article' : contentType === 'comment' ? 'comment' : 'user',
      contentId,
      { flagId: flag.id, reason, severity: flag.severity },
      ip,
      userAgent
    );

    return new Response(JSON.stringify(flag), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error creating moderation flag:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to create moderation flag' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};

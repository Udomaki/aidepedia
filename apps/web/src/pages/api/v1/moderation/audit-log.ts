import type { APIRoute } from 'astro';
import { getSession } from '../../../../lib/auth';
import {
  getModerationAuditLogs,
  getModeratorRole,
} from '@aidepedia/db/queries';
import type { ModerationAuditLogQueryParams } from '@aidepedia/db/types';

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

    const params: ModerationAuditLogQueryParams = {
      moderatorId: parseInt(url.searchParams.get('moderatorId') || '0') || undefined,
      action: url.searchParams.get('action') || undefined,
      resourceType: url.searchParams.get('resourceType') as any || undefined,
      dateFrom: url.searchParams.get('dateFrom') || undefined,
      dateTo: url.searchParams.get('dateTo') || undefined,
      page: parseInt(url.searchParams.get('page') || '1'),
      limit: parseInt(url.searchParams.get('limit') || '50'),
    };

    const result = await getModerationAuditLogs(params);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error fetching moderation audit logs:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to fetch moderation audit logs' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};

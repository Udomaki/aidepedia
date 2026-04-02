import type { APIRoute } from 'astro';
import { getSession } from '../../../../../lib/auth';
import {
  assignModeratorRole,
  updateModeratorRole,
  getModeratorRole,
} from '@aidepedia/db/queries';

export const POST: APIRoute = async ({ request }) => {
  try {
    const session = await getSession(request);
    if (!session?.user?.id) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Check if user is an admin
    const adminRole = await getModeratorRole(session.user.id);
    if (!adminRole || adminRole.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await request.json();
    const { userId, role, permissions } = body;

    if (!userId || !role) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const roleData = {
      userId,
      role,
      permissions: permissions || [],
      assignedBy: session.user.id,
    };

    const moderatorRole = await assignModeratorRole(roleData);

    return new Response(JSON.stringify(moderatorRole), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error assigning moderator role:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to assign moderator role' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};

export const PATCH: APIRoute = async ({ request }) => {
  try {
    const session = await getSession(request);
    if (!session?.user?.id) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Check if user is an admin
    const adminRole = await getModeratorRole(session.user.id);
    if (!adminRole || adminRole.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await request.json();
    const { userId, role, permissions, isActive } = body;

    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'userId is required' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const updates: any = {};
    if (role) updates.role = role;
    if (permissions !== undefined) updates.permissions = permissions;
    if (isActive !== undefined) updates.isActive = isActive;

    const moderatorRole = await updateModeratorRole(userId, updates);

    return new Response(JSON.stringify(moderatorRole), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error updating moderator role:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to update moderator role' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};

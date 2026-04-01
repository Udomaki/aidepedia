import type { APIRoute } from 'astro';
import { getSession } from '../../../lib/auth';
import { db, users, eq } from '@aidepedia/db';

export const GET: APIRoute = async ({ request }) => {
  try {
    const session = await getSession(request);
    
    if (!session?.user?.id) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get user
    const [user] = await db
      .select({
        twoFactorEnabled: users.twoFactorEnabled,
        twoFactorVerifiedAt: users.twoFactorVerifiedAt,
      })
      .from(users)
      .where(eq(users.id, parseInt(session.user.id)))
      .limit(1);

    if (!user) {
      return new Response(JSON.stringify({ error: 'User not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      enabled: user.twoFactorEnabled || false,
      verifiedAt: user.twoFactorVerifiedAt,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('2FA status error:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to get 2FA status',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

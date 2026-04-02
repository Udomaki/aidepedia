import type { APIRoute } from 'astro';
import { getSession } from '../../../lib/auth';
import { db, users, eq } from '@aidepedia/db';

// Generate recovery codes (edge-compatible)
async function generateRecoveryCodes(count: number = 10): Promise<string[]> {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    // Use Web Crypto API which works in both Node.js and edge runtimes
    const buffer = new Uint8Array(4);
    crypto.getRandomValues(buffer);
    const code = Array.from(buffer, byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
    codes.push(`${code.slice(0, 4)}-${code.slice(4)}`);
  }
  return codes;
}

export const POST: APIRoute = async ({ request }) => {
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
      .select()
      .from(users)
      .where(eq(users.id, parseInt(session.user.id)))
      .limit(1);

    if (!user || !user.twoFactorEnabled) {
      return new Response(JSON.stringify({ error: '2FA not enabled' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Generate new recovery codes
    const recoveryCodes = await generateRecoveryCodes(10);

    // Update user with new recovery codes
    await db
      .update(users)
      .set({
        recoveryCodes: JSON.stringify(recoveryCodes),
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    return new Response(JSON.stringify({
      success: true,
      recoveryCodes,
      message: 'New recovery codes generated. Old codes are now invalid.',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Recovery codes regeneration error:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to regenerate recovery codes',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

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
      .select()
      .from(users)
      .where(eq(users.id, parseInt(session.user.id)))
      .limit(1);

    if (!user || !user.twoFactorEnabled) {
      return new Response(JSON.stringify({ error: '2FA not enabled' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const recoveryCodes = JSON.parse(user.recoveryCodes || '[]');

    return new Response(JSON.stringify({
      recoveryCodes,
      count: recoveryCodes.length,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Recovery codes fetch error:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to fetch recovery codes',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

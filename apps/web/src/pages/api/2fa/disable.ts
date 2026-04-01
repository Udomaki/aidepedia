import type { APIRoute } from 'astro';
import { TOTP } from 'otplib';
import { getSession } from '../../../lib/auth';
import { db, users, eq } from '@aidepedia/db';

const totp = new TOTP();

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
    const { verificationCode } = body;

    if (!verificationCode) {
      return new Response(JSON.stringify({ error: 'Missing verification code' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get user
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, parseInt(session.user.id)))
      .limit(1);

    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
      return new Response(JSON.stringify({ error: '2FA not enabled' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Verify the code before disabling
    const isValid = totp.verify({
      token: verificationCode,
      secret: user.twoFactorSecret,
    });

    if (!isValid) {
      return new Response(JSON.stringify({ error: 'Invalid verification code' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Disable 2FA and clear secrets
    await db
      .update(users)
      .set({
        twoFactorEnabled: false,
        twoFactorSecret: null,
        recoveryCodes: null,
        twoFactorVerifiedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    return new Response(JSON.stringify({
      success: true,
      message: '2FA disabled successfully',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('2FA disable error:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to disable 2FA',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

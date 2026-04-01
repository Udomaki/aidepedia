import type { APIRoute } from 'astro';
import { TOTP } from 'otplib';
import { db, users, eq } from '@aidepedia/db';
import { getSession } from '../../../lib/auth';

const totp = new TOTP();

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const body = await request.json();
    const { userId, code, recoveryCode } = body;

    // If userId is provided, use it (for login flow)
    // Otherwise, get from session (for other operations)
    let targetUserId = userId;
    
    if (!targetUserId) {
      const session = await getSession(request);
      if (!session?.user?.id) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      targetUserId = parseInt(session.user.id);
    }

    // Get user
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, targetUserId))
      .limit(1);

    if (!user || !user.twoFactorEnabled) {
      return new Response(JSON.stringify({ error: '2FA not enabled for this user' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Check if using recovery code
    if (recoveryCode) {
      const storedCodes = JSON.parse(user.recoveryCodes || '[]');
      const codeIndex = storedCodes.indexOf(recoveryCode);

      if (codeIndex === -1) {
        return new Response(JSON.stringify({ error: 'Invalid recovery code' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Remove used recovery code
      storedCodes.splice(codeIndex, 1);
      await db
        .update(users)
        .set({
          recoveryCodes: JSON.stringify(storedCodes),
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));

      return new Response(JSON.stringify({
        success: true,
        message: 'Recovery code accepted. Consider regenerating your recovery codes.',
        remainingCodes: storedCodes.length,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Verify TOTP code
    if (!code) {
      return new Response(JSON.stringify({ error: 'Missing verification code' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!user.twoFactorSecret) {
      return new Response(JSON.stringify({ error: '2FA not properly configured' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const isValid = totp.verify({
      token: code,
      secret: user.twoFactorSecret,
    });

    if (!isValid) {
      return new Response(JSON.stringify({ error: 'Invalid verification code' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Update last verified timestamp
    await db
      .update(users)
      .set({
        twoFactorVerifiedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    return new Response(JSON.stringify({
      success: true,
      message: '2FA verification successful',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('2FA verify error:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to verify 2FA',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

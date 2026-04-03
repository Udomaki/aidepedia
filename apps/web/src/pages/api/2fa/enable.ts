import type { APIRoute } from 'astro';
import { TOTP } from 'otplib';
import { getSession } from '../../../lib/auth';
import { db, users, eq } from '@aidepedia/db';

const totp = new TOTP();

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

    const body = await request.json();
    const { secret, verificationCode } = body;

    if (!secret || !verificationCode) {
      return new Response(JSON.stringify({ error: 'Missing secret or verification code' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Verify the TOTP code
    const isValid = totp.verify({
      token: verificationCode,
      secret: secret,
    });

    if (!isValid) {
      return new Response(JSON.stringify({ error: 'Invalid verification code' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Generate recovery codes
    const recoveryCodes = await generateRecoveryCodes(10);

    // Update user with 2FA enabled
    const [updatedUser] = await db
      .update(users)
      .set({
        twoFactorEnabled: true,
        twoFactorSecret: secret,
        recoveryCodes: JSON.stringify(recoveryCodes),
        twoFactorVerifiedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, parseInt(session.user.id)))
      .returning();

    if (!updatedUser) {
      return new Response(JSON.stringify({ error: 'Failed to enable 2FA' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      recoveryCodes,
      message: '2FA enabled successfully. Please save your recovery codes in a safe place.',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('2FA enable error:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to enable 2FA',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

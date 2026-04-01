import type { APIRoute } from 'astro';
import { TOTP } from 'otplib';
import QRCode from 'qrcode';
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

    // Generate a new TOTP secret
    const secret = totp.generateSecret();
    
    // Get user email for the QR code
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, parseInt(session.user.id)))
      .limit(1);

    if (!user) {
      return new Response(JSON.stringify({ error: 'User not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Generate OTP auth URL
    const service = 'AIdepedia';
    const otpauth = totp.keyuri(user.email, service, secret);

    // Generate QR code as data URL
    const qrCodeUrl = await QRCode.toDataURL(otpauth);

    // Temporarily store the secret (will be saved when verified)
    // In a production app, you might want to store this in a temporary location
    // or encrypt it before storing
    
    return new Response(JSON.stringify({
      secret,
      qrCode: qrCodeUrl,
      manualEntryKey: secret,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('2FA setup error:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to setup 2FA',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

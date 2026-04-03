import type { APIRoute } from 'astro';
import { db, users, organizations, organizationMembers, ssoSessions, ssoAuditLog, eq, and } from '@aidepedia/db';
import { exchangeOIDCCode, validateOIDCToken, getOIDCUserInfo } from '../../../../middleware/oidc';
import { logSSOEvent } from '../../../../middleware/saml';
import { nanoid } from 'nanoid';

interface OIDCState {
  organizationId: number;
  callbackUrl: string;
  codeVerifier: string;
  timestamp: number;
}

// OIDC Callback endpoint
// This endpoint handles the authorization code flow callback

export const GET: APIRoute = async ({ url, cookies, redirect }) => {
  try {
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');
    const errorDescription = url.searchParams.get('error_description');
    
    // Handle OAuth errors
    if (error) {
      console.error('OIDC error:', error, errorDescription);
      
      await logSSOEvent('sso_login_failed', {
        provider: 'oidc',
        success: false,
        errorMessage: `${error}: ${errorDescription}`,
        ipAddress: url.hostname,
      });
      
      return redirect(`/login?error=${encodeURIComponent(errorDescription || error)}`);
    }
    
    if (!code || !state) {
      return redirect('/login?error=missing_parameters');
    }
    
    // Decode state
    let stateData: OIDCState;
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    } catch {
      return redirect('/login?error=invalid_state');
    }
    
    const { organizationId, callbackUrl, codeVerifier } = stateData;
    
    // Exchange authorization code for tokens
    const tokenResult = await exchangeOIDCCode(organizationId, code, codeVerifier);
    
    if (!tokenResult.success || !tokenResult.tokens) {
      return redirect('/login?error=token_exchange_failed');
    }
    
    const { accessToken, idToken, refreshToken, expiresIn } = tokenResult.tokens;
    
    // Validate ID token
    const validationResult = await validateOIDCToken(organizationId, idToken);
    
    if (!validationResult.success || !validationResult.claims) {
      return redirect('/login?error=token_validation_failed');
    }
    
    // Get user info from OIDC provider
    const userInfoResult = await getOIDCUserInfo(organizationId, accessToken);
    
    if (!userInfoResult.success || !userInfoResult.user) {
      return redirect('/login?error=user_info_failed');
    }
    
    const { email, name, picture, externalId } = userInfoResult.user;
    
    // Check if user exists
    let [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    
    if (!user) {
      // Create new user
      [user] = await db.insert(users).values({
        email,
        name: name || email.split('@')[0],
        image: picture,
        emailVerified: new Date(), // Trust IdP email verification
      }).returning();
    } else {
      // Update user info if needed
      if (picture && user.image !== picture) {
        await db
          .update(users)
          .set({ image: picture, updatedAt: new Date() })
          .where(eq(users.id, user.id));
      }
    }
    
    // Add user to organization if not already a member
    const [existingMember] = await db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, organizationId),
          eq(organizationMembers.userId, user.id)
        )
      )
      .limit(1);
    
    if (!existingMember) {
      await db.insert(organizationMembers).values({
        organizationId,
        userId: user.id,
        role: 'member',
        scimExternalId: externalId,
        scimSyncedAt: new Date(),
      });
    }
    
    // Create SSO session record
    const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : new Date(Date.now() + 24 * 60 * 60 * 1000);
    
    await db.insert(ssoSessions).values({
      userId: user.id,
      organizationId,
      provider: 'oidc',
      idToken,
      accessToken,
      refreshToken,
      expiresAt,
    });
    
    // Create session cookie
    const sessionToken = nanoid(32);
    cookies.set('session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 1 week
      path: '/',
    });
    
    // Log successful login
    await logSSOEvent('sso_login_success', {
      organizationId,
      userId: user.id,
      provider: 'oidc',
      success: true,
      ipAddress: url.hostname,
      eventData: { email },
    });
    
    // Redirect to callback URL
    return redirect(callbackUrl);
  } catch (error) {
    console.error('OIDC callback error:', error);
    
    await logSSOEvent('sso_login_failed', {
      provider: 'oidc',
      success: false,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      ipAddress: url.hostname,
    });
    
    return redirect('/login?error=oidc_error');
  }
};

// POST endpoint for token refresh
export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const body = await request.json();
    const { organizationId, refreshToken } = body;
    
    if (!organizationId || !refreshToken) {
      return new Response(JSON.stringify({ error: 'Missing parameters' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    const result = await exchangeOIDCCode(organizationId, 'dummy', refreshToken);
    
    if (!result.success) {
      return new Response(JSON.stringify({ error: result.error }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    return new Response(JSON.stringify(result.tokens), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('OIDC refresh error:', error);
    return new Response(JSON.stringify({ error: 'Token refresh failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

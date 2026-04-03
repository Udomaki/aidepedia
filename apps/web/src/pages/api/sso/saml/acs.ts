import type { APIRoute } from 'astro';
import { db, users, organizations, organizationMembers, ssoSessions, ssoAuditLog, eq, and } from '@aidepedia/db';
import { validateSAMLAssertion, logSSOEvent } from '../../../../middleware/saml';
import { getSession } from 'auth-astro/server';
import { nanoid } from 'nanoid';

// SAML Assertion Consumer Service (ACS) endpoint
// This endpoint receives SAML responses from the Identity Provider

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  try {
    const formData = await request.formData();
    const samlResponse = formData.get('SAMLResponse') as string;
    const relayState = formData.get('RelayState') as string; // Contains callback URL and org ID
    
    if (!samlResponse) {
      return new Response(JSON.stringify({ error: 'Missing SAML response' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    // Parse relay state to get organization ID and callback URL
    let organizationId: number;
    let callbackUrl = '/';
    
    if (relayState) {
      try {
        const state = JSON.parse(Buffer.from(relayState, 'base64').toString());
        organizationId = state.organizationId;
        callbackUrl = state.callbackUrl || '/';
      } catch {
        // If not JSON, treat as callback URL
        callbackUrl = relayState;
      }
    } else {
      return new Response(JSON.stringify({ error: 'Missing relay state' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    // Validate SAML assertion
    const validation = await validateSAMLAssertion(samlResponse, organizationId);
    
    if (!validation.success || !validation.user) {
      // Log failed login
      await logSSOEvent('sso_login_failed', {
        organizationId,
        provider: 'saml',
        success: false,
        errorMessage: validation.error,
        ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
        userAgent: request.headers.get('user-agent') || undefined,
      });
      
      return redirect(`/login?error=saml_validation_failed`);
    }
    
    const { email, name, externalId, groups } = validation.user;
    
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
        emailVerified: new Date(), // Trust IdP email verification
      }).returning();
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
    await db.insert(ssoSessions).values({
      userId: user.id,
      organizationId,
      provider: 'saml',
      nameId: externalId,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    });
    
    // Create session for auth-astro
    // Note: This requires integration with auth-astro's session management
    // For now, we'll set a simple session cookie
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
      provider: 'saml',
      success: true,
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
      eventData: { email },
    });
    
    // Redirect to callback URL
    return redirect(callbackUrl);
  } catch (error) {
    console.error('SAML ACS error:', error);
    
    await logSSOEvent('sso_login_failed', {
      provider: 'saml',
      success: false,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    });
    
    return redirect(`/login?error=saml_error`);
  }
};

// GET endpoint for testing/metadata
export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  
  // Return SAML metadata
  if (url.pathname.endsWith('/metadata')) {
    // Generate SP metadata
    const metadata = `<?xml version="1.0" encoding="UTF-8"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" 
                     entityID="aidepedia-saml"
                     validUntil="${new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()}">
  <md:SPSSODescriptor AuthnRequestsSigned="false" 
                       WantAssertionsSigned="true" 
                       protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
                                  Location="${process.env.SITE_URL || 'http://localhost:4321'}/api/sso/saml/acs"
                                  index="0" 
                                  isDefault="true"/>
  </md:SPSSODescriptor>
</md:EntityDescriptor>`;
    
    return new Response(metadata, {
      headers: { 'Content-Type': 'application/xml' },
    });
  }
  
  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json' },
  });
};

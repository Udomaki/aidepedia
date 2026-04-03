import type { APIRoute } from 'astro';
import { db, organizations, ssoIdentityProviders, eq, and, desc } from '@aidepedia/db';
import { getSAMLLoginUrl } from '../../../middleware/saml';
import { getOIDCAuthorizationUrl, generatePKCE } from '../../../middleware/oidc';
import { logSSOEvent } from '../../../middleware/saml';
import { nanoid } from 'nanoid';

interface LoginRequest {
  email: string;
  callbackUrl?: string;
}

// Detect SSO provider based on email domain
export const POST: APIRoute = async ({ request, redirect }) => {
  try {
    const { email, callbackUrl = '/' } = await request.json() as LoginRequest;
    
    if (!email) {
      return new Response(JSON.stringify({ error: 'Email is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    // Extract domain from email
    const domain = email.split('@')[1]?.toLowerCase();
    
    if (!domain) {
      return new Response(JSON.stringify({ error: 'Invalid email format' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    // Check if domain has SSO configured
    const [org] = await db
      .select()
      .from(organizations)
      .where(
        and(
          eq(organizations.domain, domain),
          eq(organizations.ssoEnabled, true)
        )
      )
      .limit(1);
    
    if (!org) {
      // No SSO configured for this domain
      return new Response(JSON.stringify({ 
        ssoRequired: false,
        message: 'No SSO configured for this domain' 
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    // Log domain-based SSO detection
    await logSSOEvent('domain_based_sso_detected', {
      organizationId: org.id,
      provider: org.ssoProvider,
      success: true,
      eventData: { email, domain },
    });
    
    // If SSO is required, enforce it
    if (org.ssoRequired) {
      await logSSOEvent('sso_enforcement_triggered', {
        organizationId: org.id,
        provider: org.ssoProvider,
        success: true,
        eventData: { email },
      });
    }
    
    // Get IdP configuration
    const [idp] = await db
      .select()
      .from(ssoIdentityProviders)
      .where(
        and(
          eq(ssoIdentityProviders.organizationId, org.id),
          eq(ssoIdentityProviders.isActive, true)
        )
      )
      .orderBy(ssoIdentityProviders.priority)
      .limit(1);
    
    if (!idp) {
      return new Response(JSON.stringify({ error: 'No IdP configured' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    // Generate login URL based on provider type
    if (idp.type === 'saml') {
      // SAML login
      const result = await getSAMLLoginUrl(org.id, callbackUrl);
      
      if (result.error) {
        return new Response(JSON.stringify({ error: result.error }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      
      return new Response(JSON.stringify({ 
        ssoRequired: true,
        provider: 'saml',
        url: result.url 
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    } else if (idp.type === 'oidc') {
      // OIDC login
      const { verifier, challenge } = generatePKCE();
      const state = Buffer.from(JSON.stringify({
        organizationId: org.id,
        callbackUrl,
        codeVerifier: verifier,
        timestamp: Date.now(),
      })).toString('base64');
      
      const result = await getOIDCAuthorizationUrl(org.id, state, challenge);
      
      if (result.error) {
        return new Response(JSON.stringify({ error: result.error }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      
      // Store code verifier in cookie for callback
      return new Response(JSON.stringify({ 
        ssoRequired: true,
        provider: 'oidc',
        url: result.url 
      }), {
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': `code_verifier=${verifier}; HttpOnly; Secure; SameSite=Lax; Max-Age=600; Path=/`,
        },
      });
    }
    
    return new Response(JSON.stringify({ error: 'Unknown provider type' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('SSO login error:', error);
    return new Response(JSON.stringify({ error: 'SSO login failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

// GET endpoint for checking SSO configuration
export const GET: APIRoute = async ({ url }) => {
  const email = url.searchParams.get('email');
  
  if (!email) {
    return new Response(JSON.stringify({ error: 'Email is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  
  const domain = email.split('@')[1]?.toLowerCase();
  
  if (!domain) {
    return new Response(JSON.stringify({ error: 'Invalid email format' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  
  const [org] = await db
    .select()
    .from(organizations)
    .where(
      and(
        eq(organizations.domain, domain),
        eq(organizations.ssoEnabled, true)
      )
    )
    .limit(1);
  
  return new Response(JSON.stringify({
    ssoConfigured: !!org,
    ssoRequired: org?.ssoRequired || false,
    organization: org ? {
      name: org.name,
      domain: org.domain,
      ssoProvider: org.ssoProvider,
    } : null,
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
};

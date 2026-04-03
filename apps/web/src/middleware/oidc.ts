import { defineMiddleware } from 'astro/middleware';
import type { APIContext } from 'astro';
import { db, organizations, organizationMembers, ssoAuditLog, ssoIdentityProviders, eq, and } from '@aidepedia/db';
import * as jose from 'jose';
import { nanoid } from 'nanoid';

interface OIDCConfig {
  clientId: string;
  clientSecret: string;
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  userInfoEndpoint: string;
  jwksUri: string;
  callbackUrl: string;
}

interface OIDCDiscoveryDocument {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  jwks_uri: string;
  scopes_supported?: string[];
  response_types_supported?: string[];
}

// Fetch OIDC discovery document
async function fetchDiscoveryDocument(discoveryUrl: string): Promise<OIDCDiscoveryDocument> {
  const response = await fetch(discoveryUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch discovery document: ${response.statusText}`);
  }
  return response.json();
}

// Get OIDC IdP configuration for organization
export async function getOIDCIdP(organizationId: number) {
  const [idp] = await db
    .select()
    .from(ssoIdentityProviders)
    .where(
      and(
        eq(ssoIdentityProviders.organizationId, organizationId),
        eq(ssoIdentityProviders.type, 'oidc'),
        eq(ssoIdentityProviders.isActive, true)
      )
    )
    .limit(1);
  
  return idp;
}

// Get full OIDC configuration
export async function getOIDCConfig(organizationId: number): Promise<OIDCConfig | null> {
  const idp = await getOIDCIdP(organizationId);
  
  if (!idp || !idp.oidcClientId || !idp.oidcDiscoveryUrl) {
    return null;
  }
  
  try {
    const discovery = await fetchDiscoveryDocument(idp.oidcDiscoveryUrl);
    
    return {
      clientId: idp.oidcClientId,
      clientSecret: idp.oidcClientSecret || '',
      issuer: discovery.issuer,
      authorizationEndpoint: discovery.authorization_endpoint,
      tokenEndpoint: discovery.token_endpoint,
      userInfoEndpoint: discovery.userinfo_endpoint,
      jwksUri: discovery.jwks_uri,
      callbackUrl: `${process.env.SITE_URL || 'http://localhost:4321'}/api/sso/oidc/callback`,
    };
  } catch (error) {
    console.error('Failed to get OIDC config:', error);
    return null;
  }
}

// Generate OIDC authorization URL
export async function getOIDCAuthorizationUrl(
  organizationId: number,
  state: string,
  codeChallenge: string,
  codeChallengeMethod: string = 'S256'
): Promise<{ url: string; error?: string }> {
  try {
    const config = await getOIDCConfig(organizationId);
    
    if (!config) {
      return { url: '', error: 'OIDC not configured for this organization' };
    }
    
    const params = new URLSearchParams({
      client_id: config.clientId,
      response_type: 'code',
      scope: 'openid email profile',
      redirect_uri: config.callbackUrl,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: codeChallengeMethod,
    });
    
    const url = `${config.authorizationEndpoint}?${params.toString()}`;
    
    return { url };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to generate OIDC authorization URL';
    return { url: '', error: errorMessage };
  }
}

// Exchange authorization code for tokens
export async function exchangeOIDCCode(
  organizationId: number,
  code: string,
  codeVerifier: string
): Promise<{
  success: boolean;
  tokens?: {
    accessToken: string;
    idToken: string;
    refreshToken?: string;
    expiresIn?: number;
  };
  error?: string;
}> {
  try {
    const config = await getOIDCConfig(organizationId);
    
    if (!config) {
      return { success: false, error: 'OIDC not configured' };
    }
    
    const response = await fetch(config.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: config.callbackUrl,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code_verifier: codeVerifier,
      }).toString(),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Token exchange failed: ${errorText}`);
    }
    
    const tokens = await response.json();
    
    // Log successful token exchange
    await logSSOEvent('oidc_token_received', {
      organizationId,
      success: true,
      provider: 'oidc',
    });
    
    return {
      success: true,
      tokens: {
        accessToken: tokens.access_token,
        idToken: tokens.id_token,
        refreshToken: tokens.refresh_token,
        expiresIn: tokens.expires_in,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Token exchange failed';
    
    await logSSOEvent('oidc_token_received', {
      organizationId,
      success: false,
      provider: 'oidc',
      errorMessage,
    });
    
    return { success: false, error: errorMessage };
  }
}

// Validate OIDC ID token
export async function validateOIDCToken(
  organizationId: number,
  idToken: string
): Promise<{
  success: boolean;
  claims?: jose.JWTPayload;
  error?: string;
}> {
  try {
    const config = await getOIDCConfig(organizationId);
    
    if (!config) {
      return { success: false, error: 'OIDC not configured' };
    }
    
    // Fetch JWKS
    const jwks = jose.createRemoteJWKSet(new URL(config.jwksUri));
    
    // Verify and decode the token
    const { payload } = await jose.jwtVerify(idToken, jwks, {
      issuer: config.issuer,
      audience: config.clientId,
    });
    
    return { success: true, claims: payload };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Token validation failed';
    return { success: false, error: errorMessage };
  }
}

// Get user info from OIDC provider
export async function getOIDCUserInfo(
  organizationId: number,
  accessToken: string
): Promise<{
  success: boolean;
  user?: {
    email: string;
    name?: string;
    picture?: string;
    externalId?: string;
  };
  error?: string;
}> {
  try {
    const config = await getOIDCConfig(organizationId);
    
    if (!config) {
      return { success: false, error: 'OIDC not configured' };
    }
    
    const response = await fetch(config.userInfoEndpoint, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    
    if (!response.ok) {
      throw new Error(`UserInfo request failed: ${response.statusText}`);
    }
    
    const userInfo = await response.json();
    
    return {
      success: true,
      user: {
        email: userInfo.email,
        name: userInfo.name || userInfo.given_name || userInfo.family_name,
        picture: userInfo.picture,
        externalId: userInfo.sub,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'UserInfo request failed';
    return { success: false, error: errorMessage };
  }
}

// Refresh OIDC token
export async function refreshOIDCToken(
  organizationId: number,
  refreshToken: string
): Promise<{
  success: boolean;
  tokens?: {
    accessToken: string;
    idToken?: string;
    refreshToken?: string;
    expiresIn?: number;
  };
  error?: string;
}> {
  try {
    const config = await getOIDCConfig(organizationId);
    
    if (!config) {
      return { success: false, error: 'OIDC not configured' };
    }
    
    const response = await fetch(config.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: config.clientId,
        client_secret: config.clientSecret,
      }).toString(),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Token refresh failed: ${errorText}`);
    }
    
    const tokens = await response.json();
    
    return {
      success: true,
      tokens: {
        accessToken: tokens.access_token,
        idToken: tokens.id_token,
        refreshToken: tokens.refresh_token,
        expiresIn: tokens.expires_in,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Token refresh failed';
    return { success: false, error: errorMessage };
  }
}

// Generate PKCE code verifier and challenge
export function generatePKCE(): { verifier: string; challenge: string } {
  const verifier = nanoid(128);
  // For simplicity, using plain verifier. In production, use S256 challenge
  const challenge = verifier;
  return { verifier, challenge };
}

// Log SSO event (shared with SAML)
async function logSSOEvent(
  eventType: typeof ssoAuditLog.$inferInsert['eventType'],
  data: {
    organizationId?: number;
    userId?: number;
    provider?: string;
    success?: boolean;
    errorMessage?: string;
    ipAddress?: string;
    userAgent?: string;
    eventData?: any;
  }
) {
  await db.insert(ssoAuditLog).values({
    organizationId: data.organizationId,
    userId: data.userId,
    eventType,
    provider: data.provider,
    success: data.success,
    errorMessage: data.errorMessage,
    ipAddress: data.ipAddress,
    userAgent: data.userAgent,
    eventData: data.eventData,
  });
}

// OIDC Middleware
export const oidcMiddleware = defineMiddleware(async (context: APIContext, next) => {
  const { pathname } = context.url;
  
  // Only process OIDC-related routes
  if (!pathname.startsWith('/api/sso/oidc')) {
    return next();
  }
  
  // Store OIDC helpers in locals for API routes to use
  context.locals.oidc = {
    getAuthorizationUrl: getOIDCAuthorizationUrl,
    exchangeCode: exchangeOIDCCode,
    validateToken: validateOIDCToken,
    getUserInfo: getOIDCUserInfo,
    refreshToken: refreshOIDCToken,
    generatePKCE,
  };
  
  return next();
});

export default oidcMiddleware;

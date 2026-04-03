import { Discovery, Issuer, Client, generators } from 'openid-client';
import type { OidcUserInfo } from '@aidepedia/db';

// Store OIDC clients in memory (consider using a proper cache in production)
const oidcClients = new Map<string, Client>();

/**
 * Get or create OIDC client for an organization
 */
async function getOidcClient(config: {
  discoveryUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<Client> {
  const cacheKey = `${config.discoveryUrl}:${config.clientId}`;
  
  if (oidcClients.has(cacheKey)) {
    return oidcClients.get(cacheKey)!;
  }

  const issuer = await Issuer.discover(config.discoveryUrl);
  
  const client = new issuer.Client({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uris: [config.redirectUri],
    response_types: ['code'],
  });

  oidcClients.set(cacheKey, client);
  return client;
}

/**
 * Get OIDC login URL
 */
export async function getOidcLoginUrl(
  discoveryUrl: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  state?: string,
  nonce?: string
): Promise<{ url: string; state: string; nonce: string }> {
  const client = await getOidcClient({
    discoveryUrl,
    clientId,
    clientSecret,
    redirectUri,
  });

  const _state = state || generators.state();
  const _nonce = nonce || generators.nonce();
  const codeVerifier = generators.codeVerifier();
  const codeChallenge = generators.codeChallenge(codeVerifier);

  const url = client.authorizationUrl({
    scope: 'openid email profile',
    state: _state,
    nonce: _nonce,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  return { url, state: _state, nonce: _nonce };
}

/**
 * Handle OIDC callback
 */
export async function handleOidcCallback(
  discoveryUrl: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  code: string,
  state: string,
  nonce: string,
  codeVerifier?: string
): Promise<OidcUserInfo> {
  const client = await getOidcClient({
    discoveryUrl,
    clientId,
    clientSecret,
    redirectUri,
  });

  const params = {
    code,
    state,
  };

  const tokenSet = await client.callback(redirectUri, params, {
    state,
    nonce,
    code_verifier: codeVerifier,
  });

  if (!tokenSet.access_token) {
    throw new Error('No access token received');
  }

  // Get user info from the userinfo endpoint
  const userinfo = await client.userinfo(tokenSet.access_token);

  const userInfo: OidcUserInfo = {
    sub: userinfo.sub,
    email: userinfo.email as string || userinfo.emails?.[0]?.value || '',
    name: userinfo.name as string | undefined,
    givenName: userinfo.given_name as string | undefined,
    familyName: userinfo.family_name as string | undefined,
    groups: (userinfo.groups as string[]) || [],
    picture: userinfo.picture as string | undefined,
    emailVerified: userinfo.email_verified as boolean | undefined,
  };

  return userInfo;
}

/**
 * Verify OIDC ID token
 */
export async function verifyOidcToken(
  discoveryUrl: string,
  clientId: string,
  clientSecret: string,
  idToken: string,
  nonce?: string
): Promise<OidcUserInfo> {
  const client = await getOidcClient({
    discoveryUrl,
    clientId,
    clientSecret,
    redirectUri: '', // Not needed for verification
  });

  const tokenSet = await client.callback('', {}, {
    nonce,
  });

  const claims = tokenSet.claims();

  if (!claims) {
    throw new Error('Invalid ID token');
  }

  const userInfo: OidcUserInfo = {
    sub: claims.sub,
    email: claims.email || '',
    name: claims.name,
    givenName: claims.given_name,
    familyName: claims.family_name,
    emailVerified: claims.email_verified,
  };

  return userInfo;
}

/**
 * Refresh OIDC token
 */
export async function refreshOidcToken(
  discoveryUrl: string,
  clientId: string,
  clientSecret: string,
  refreshToken: string
): Promise<{
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
}> {
  const client = await getOidcClient({
    discoveryUrl,
    clientId,
    clientSecret,
    redirectUri: '', // Not needed for refresh
  });

  const tokenSet = await client.refresh(refreshToken);

  return {
    accessToken: tokenSet.access_token!,
    refreshToken: tokenSet.refresh_token,
    expiresIn: tokenSet.expires_at! - Math.floor(Date.now() / 1000),
  };
}

/**
 * Get OIDC discovery document
 */
export async function getOidcDiscovery(discoveryUrl: string): Promise<Discovery> {
  const issuer = await Issuer.discover(discoveryUrl);
  return issuer.metadata;
}

/**
 * Validate OIDC configuration
 */
export async function validateOidcConfig(config: {
  discoveryUrl: string;
  clientId: string;
  clientSecret: string;
}): Promise<{ valid: boolean; error?: string }> {
  try {
    const issuer = await Issuer.discover(config.discoveryUrl);
    
    const client = new issuer.Client({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uris: ['http://localhost:4321/auth/callback'],
      response_types: ['code'],
    });

    // Just creating the client is enough to validate the config
    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

import type { APIContext } from 'astro';
import { Jackson } from '@boxyhq/saml-jackson';
import type { SamlUserAttributes } from '@aidepedia/db';

let jackson: Awaited<ReturnType<typeof Jackson>> | null = null;

/**
 * Initialize SAML Jackson provider
 */
async function getJackson() {
  if (jackson) return jackson;

  jackson = await Jackson({
    externalUrl: import.meta.env.SITE_URL || 'http://localhost:4321',
    samlPath: '/api/auth/saml/callback',
    samlAudience: 'aidepedia',
    db: {
      engine: 'sql',
      type: 'postgres',
      url: process.env.DATABASE_URL!,
    },
  });

  return jackson;
}

/**
 * Create SAML connection for an organization
 */
export async function createSamlConnection(
  organizationId: number,
  organizationName: string,
  metadataUrl?: string,
  metadataXml?: string,
  entryPoint?: string,
  certificate?: string,
  issuer?: string
) {
  const apiController = (await getJackson()).apiController;

  const connection = await apiController.createSAMLConnection({
    tenant: organizationId.toString(),
    product: 'aidepedia',
    name: organizationName,
    defaultRedirectUrl: `${import.meta.env.SITE_URL}/auth/callback`,
    redirectUrl: `${import.meta.env.SITE_URL}/*`,
    metadataUrl,
    rawMetadata: metadataXml,
    entryPoint,
    x509cert: certificate,
    issuer,
  });

  return connection;
}

/**
 * Get SAML connection for an organization
 */
export async function getSamlConnection(organizationId: number) {
  const apiController = (await getJackson()).apiController;

  const connections = await apiController.getConnections({
    tenant: organizationId.toString(),
    product: 'aidepedia',
  });

  return connections[0];
}

/**
 * Delete SAML connection for an organization
 */
export async function deleteSamlConnection(organizationId: number) {
  const apiController = (await getJackson()).apiController;

  const connections = await apiController.getConnections({
    tenant: organizationId.toString(),
    product: 'aidepedia',
  });

  for (const connection of connections) {
    await apiController.deleteConnection({
      clientID: connection.clientID,
      clientSecret: connection.clientSecret,
    });
  }
}

/**
 * Get SAML login URL
 */
export async function getSamlLoginUrl(organizationId: number, state?: string) {
  const connection = await getSamlConnection(organizationId);
  
  if (!connection) {
    throw new Error('SAML connection not found');
  }

  const oauthController = (await getJackson()).oauthController;

  const { redirect_url } = await oauthController.authorize({
    request: {
      client_id: connection.clientID,
      redirect_uri: `${import.meta.env.SITE_URL}/auth/callback`,
      state: state || organizationId.toString(),
      scope: 'openid email profile',
    },
  });

  return redirect_url;
}

/**
 * Handle SAML callback
 */
export async function handleSamlCallback(
  request: Request,
  organizationId: number
): Promise<SamlUserAttributes> {
  const oauthController = (await getJackson()).oauthController;

  const formData = await request.formData();
  const body = Object.fromEntries(formData.entries());

  const connection = await getSamlConnection(organizationId);
  
  if (!connection) {
    throw new Error('SAML connection not found');
  }

  const { tokens } = await oauthController.token({
    request: {
      client_id: connection.clientID,
      client_secret: connection.clientSecret,
      code: body.code as string,
      grant_type: 'authorization_code',
      redirect_uri: `${import.meta.env.SITE_URL}/auth/callback`,
    },
  });

  // Decode the ID token to get user attributes
  const idToken = tokens?.id_token;
  if (!idToken) {
    throw new Error('No ID token received');
  }

  // Parse the JWT (without verification - Jackson handles that)
  const payload = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64').toString());

  const attributes: SamlUserAttributes = {
    nameId: payload.sub,
    email: payload.email || payload.emails?.[0]?.value || '',
    name: payload.name || `${payload.given_name || ''} ${payload.family_name || ''}`.trim(),
    firstName: payload.given_name,
    lastName: payload.family_name,
    groups: payload.groups || [],
    attributes: payload,
  };

  return attributes;
}

/**
 * Extract SAML metadata from URL
 */
export async function fetchSamlMetadata(metadataUrl: string): Promise<string> {
  const response = await fetch(metadataUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch SAML metadata: ${response.statusText}`);
  }
  return await response.text();
}

/**
 * Parse SAML metadata to extract configuration
 */
export function parseSamlMetadata(metadataXml: string): {
  entryPoint?: string;
  certificate?: string;
  issuer?: string;
} {
  // Basic XML parsing - in production you'd want to use a proper XML parser
  const entryPointMatch = metadataXml.match(/Location="([^"]+)"/);
  const certificateMatch = metadataXml.match(/<ds:X509Certificate>([^<]+)<\/ds:X509Certificate>/);
  const issuerMatch = metadataXml.match(/entityID="([^"]+)"/);

  return {
    entryPoint: entryPointMatch?.[1],
    certificate: certificateMatch?.[1]?.replace(/\s/g, ''),
    issuer: issuerMatch?.[1],
  };
}

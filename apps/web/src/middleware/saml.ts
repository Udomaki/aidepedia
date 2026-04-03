import { defineMiddleware } from 'astro/middleware';
import type { APIContext } from 'astro';
import { db, organizations, organizationMembers, ssoAuditLog, ssoIdentityProviders, eq, and } from '@aidepedia/db';
import { JacksonError, SAMLJackson } from '@boxyhq/saml-jackson';
import { nanoid } from 'nanoid';

interface SAMLConfig {
  samlPath: string;
  issuer: string;
  callbackUrl: string;
}

// Initialize Jackson SAML
async function initJackson(): Promise<SAMLJackson> {
  const jackson = await SAMLJackson.initialize({
    samlPath: `${process.env.SITE_URL || 'http://localhost:4321'}/api/sso/saml/acs`,
    issuer: 'aidepedia-saml',
    externalUrl: process.env.SITE_URL || 'http://localhost:4321',
    db: {
      engine: 'sql',
      url: process.env.DATABASE_URL || '',
    },
  });
  
  return jackson;
}

// Get organization by domain
export async function getOrganizationByDomain(domain: string) {
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.domain, domain))
    .limit(1);
  
  return org;
}

// Get SAML IdP configuration for organization
export async function getSAMLIdP(organizationId: number) {
  const [idp] = await db
    .select()
    .from(ssoIdentityProviders)
    .where(
      and(
        eq(ssoIdentityProviders.organizationId, organizationId),
        eq(ssoIdentityProviders.type, 'saml'),
        eq(ssoIdentityProviders.isActive, true)
      )
    )
    .limit(1);
  
  return idp;
}

// Log SSO event
export async function logSSOEvent(
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

// SAML Middleware
export const samlMiddleware = defineMiddleware(async (context: APIContext, next) => {
  const { pathname } = context.url;
  
  // Only process SAML-related routes
  if (!pathname.startsWith('/api/sso/saml')) {
    return next();
  }
  
  try {
    const jackson = await initJackson();
    context.locals.saml = jackson;
  } catch (error) {
    console.error('Failed to initialize SAML Jackson:', error);
    return new Response(JSON.stringify({ error: 'SAML initialization failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  
  return next();
});

// Helper to extract domain from email
export function extractDomain(email: string): string | null {
  const parts = email.split('@');
  return parts.length === 2 ? parts[1].toLowerCase() : null;
}

// Check if organization requires SSO
export async function checkSSORequired(email: string): Promise<{
  required: boolean;
  organization?: typeof organizations.$inferSelect;
  idp?: typeof ssoIdentityProviders.$inferSelect;
}> {
  const domain = extractDomain(email);
  
  if (!domain) {
    return { required: false };
  }
  
  const org = await getOrganizationByDomain(domain);
  
  if (!org || !org.ssoEnabled) {
    return { required: false };
  }
  
  if (org.ssoRequired) {
    const idp = await getSAMLIdP(org.id);
    return { required: true, organization: org, idp };
  }
  
  return { required: false, organization: org };
}

// Validate SAML assertion and extract user info
export async function validateSAMLAssertion(
  samlResponse: string,
  organizationId: number
): Promise<{
  success: boolean;
  user?: {
    email: string;
    name?: string;
    externalId?: string;
    groups?: string[];
  };
  error?: string;
}> {
  try {
    const jackson = await initJackson();
    const idp = await getSAMLIdP(organizationId);
    
    if (!idp) {
      return { success: false, error: 'No SAML IdP configured' };
    }
    
    // Parse and validate SAML response
    const { profile } = await jackson.samlResponse.validate(samlResponse, {
      issuer: idp.samlIssuer || 'aidepedia-saml',
    });
    
    // Extract user info from SAML assertion
    const user = {
      email: profile.claims.email || profile.claims.emailaddress || profile.nameID,
      name: profile.claims.name || profile.claims['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name'],
      externalId: profile.nameID,
      groups: profile.claims.groups || [],
    };
    
    // Log successful SAML authentication
    await logSSOEvent('saml_assertion_received', {
      organizationId,
      success: true,
      eventData: { email: user.email },
    });
    
    return { success: true, user };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'SAML validation failed';
    
    await logSSOEvent('saml_assertion_received', {
      organizationId,
      success: false,
      errorMessage,
    });
    
    return { success: false, error: errorMessage };
  }
}

// Generate SAML login URL
export async function getSAMLLoginUrl(
  organizationId: number,
  callbackUrl: string
): Promise<{ url: string; error?: string }> {
  try {
    const jackson = await initJackson();
    const idp = await getSAMLIdP(organizationId);
    
    if (!idp || !idp.samlEntryPoint) {
      return { url: '', error: 'SAML not configured for this organization' };
    }
    
    const { redirectUrl } = await jackson.samlRequest.getAuthorizeUrl({
      id: `saml-${organizationId}`,
      samlRequest: {
        ssoUrl: idp.samlEntryPoint,
        entityID: idp.samlIssuer || 'aidepedia-saml',
        callbackUrl,
      },
    });
    
    return { url: redirectUrl };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to generate SAML login URL';
    return { url: '', error: errorMessage };
  }
}

// SAML Logout
export async function samlLogout(
  organizationId: number,
  nameId: string,
  sessionIndex?: string
): Promise<{ url?: string; error?: string }> {
  try {
    const jackson = await initJackson();
    const idp = await getSAMLIdP(organizationId);
    
    if (!idp || !idp.samlEntryPoint) {
      return { error: 'SAML not configured' };
    }
    
    const { redirectUrl } = await jackson.samlRequest.getLogoutUrl({
      nameId,
      sessionIndex,
      sloUrl: idp.samlEntryPoint,
      entityID: idp.samlIssuer || 'aidepedia-saml',
    });
    
    return { url: redirectUrl };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'SAML logout failed';
    return { error: errorMessage };
  }
}

export default samlMiddleware;

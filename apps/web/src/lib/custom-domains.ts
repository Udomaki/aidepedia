import { db, eq, and } from '@aidepedia/db';
import { custom_domains, domain_verification_logs } from '@aidepedia/db/schema';
import { randomBytes } from 'crypto';

/**
 * Domain verification status types
 */
export type VerificationStatus = 'pending' | 'verified' | 'failed';
export type SSLStatus = 'pending' | 'provisioning' | 'active' | 'failed' | 'expired';

/**
 * DNS configuration types
 */
export interface DNSConfig {
  type: 'A' | 'CNAME' | 'ALIAS';
  name: string;
  value: string;
  ttl?: number;
}

/**
 * Custom domain interface
 */
export interface CustomDomain {
  id: number;
  organizationId: number;
  domain: string;
  isPrimary: boolean;
  sslStatus: SSLStatus;
  sslProvider: string;
  sslCertificateArn: string | null;
  sslExpiresAt: Date | null;
  verificationStatus: VerificationStatus;
  verificationToken: string | null;
  verifiedAt: Date | null;
  dnsConfig: DNSConfig | null;
  isActive: boolean;
  provisionedAt: Date | null;
  lastCheckAt: Date | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Add a custom domain to an organization
 */
export async function addCustomDomain(
  organizationId: number,
  domain: string,
  userId: number
): Promise<CustomDomain> {
  // Validate domain format
  if (!isValidDomain(domain)) {
    throw new Error('Invalid domain format');
  }

  // Check if domain already exists
  const existing = await db
    .select()
    .from(custom_domains)
    .where(eq(custom_domains.domain, domain))
    .limit(1);

  if (existing.length > 0) {
    throw new Error('Domain already registered');
  }

  // Generate verification token
  const verificationToken = generateVerificationToken();

  // Generate DNS configuration
  const dnsConfig = generateDNSConfig(domain);

  // Create domain record
  const [newDomain] = await db
    .insert(custom_domains)
    .values({
      organizationId,
      domain,
      verificationToken,
      verificationStatus: 'pending',
      sslStatus: 'pending',
      sslProvider: 'letsencrypt',
      dnsConfig,
      isActive: false,
    })
    .returning();

  // Log the domain addition
  await logDomainVerification(newDomain.id, 'domain_verify', 'pending', {
    domain,
    verificationToken,
  });

  return newDomain as CustomDomain;
}

/**
 * Verify domain ownership
 */
export async function verifyDomain(domainId: number, userId: number): Promise<boolean> {
  const [domain] = await db
    .select()
    .from(custom_domains)
    .where(eq(custom_domains.id, domainId))
    .limit(1);

  if (!domain) {
    throw new Error('Domain not found');
  }

  // Check DNS record
  const isVerified = await checkDNSVerification(domain.domain, domain.verificationToken || '');

  if (isVerified) {
    // Update verification status
    await db
      .update(custom_domains)
      .set({
        verificationStatus: 'verified',
        verifiedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(custom_domains.id, domainId));

    // Start SSL provisioning
    await provisionSSL(domainId);

    await logDomainVerification(domainId, 'domain_verify', 'success', {
      verifiedAt: new Date(),
    });

    return true;
  } else {
    await logDomainVerification(domainId, 'domain_verify', 'failed', {
      error: 'DNS verification failed',
    });

    return false;
  }
}

/**
 * Provision SSL certificate
 */
export async function provisionSSL(domainId: number): Promise<void> {
  const [domain] = await db
    .select()
    .from(custom_domains)
    .where(eq(custom_domains.id, domainId))
    .limit(1);

  if (!domain || domain.verificationStatus !== 'verified') {
    throw new Error('Domain must be verified before SSL provisioning');
  }

  // Update SSL status to provisioning
  await db
    .update(custom_domains)
    .set({
      sslStatus: 'provisioning',
      updatedAt: new Date(),
    })
    .where(eq(custom_domains.id, domainId));

  try {
    // In a real implementation, this would call AWS ACM or Let's Encrypt API
    // For now, we'll simulate the process
    const certificateArn = await requestSSLCertificate(domain.domain);

    // Update SSL status to active
    await db
      .update(custom_domains)
      .set({
        sslStatus: 'active',
        sslCertificateArn: certificateArn,
        sslExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days from now
        isActive: true,
        provisionedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(custom_domains.id, domainId));

    await logDomainVerification(domainId, 'ssl_provision', 'success', {
      certificateArn,
    });
  } catch (error) {
    await db
      .update(custom_domains)
      .set({
        sslStatus: 'failed',
        errorMessage: error instanceof Error ? error.message : 'SSL provisioning failed',
        updatedAt: new Date(),
      })
      .where(eq(custom_domains.id, domainId));

    await logDomainVerification(domainId, 'ssl_provision', 'failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    throw error;
  }
}

/**
 * Set domain as primary
 */
export async function setPrimaryDomain(
  organizationId: number,
  domainId: number,
  userId: number
): Promise<void> {
  // Verify domain belongs to organization and is active
  const [domain] = await db
    .select()
    .from(custom_domains)
    .where(
      and(
        eq(custom_domains.id, domainId),
        eq(custom_domains.organizationId, organizationId)
      )
    )
    .limit(1);

  if (!domain) {
    throw new Error('Domain not found');
  }

  if (!domain.isActive) {
    throw new Error('Domain must be active before setting as primary');
  }

  // Unset current primary domain
  await db
    .update(custom_domains)
    .set({ isPrimary: false, updatedAt: new Date() })
    .where(eq(custom_domains.organizationId, organizationId));

  // Set new primary domain
  await db
    .update(custom_domains)
    .set({ isPrimary: true, updatedAt: new Date() })
    .where(eq(custom_domains.id, domainId));
}

/**
 * Remove custom domain
 */
export async function removeDomain(domainId: number, userId: number): Promise<void> {
  const [domain] = await db
    .select()
    .from(custom_domains)
    .where(eq(custom_domains.id, domainId))
    .limit(1);

  if (!domain) {
    throw new Error('Domain not found');
  }

  // In production, you would also:
  // 1. Remove SSL certificate from ACM
  // 2. Update CDN/Load balancer configuration
  // 3. Remove DNS records

  await db.delete(custom_domains).where(eq(custom_domains.id, domainId));

  await logDomainVerification(domainId, 'domain_verify', 'success', {
    action: 'removed',
    domain: domain.domain,
  });
}

/**
 * Get all domains for an organization
 */
export async function getOrganizationDomains(organizationId: number): Promise<CustomDomain[]> {
  const domains = await db
    .select()
    .from(custom_domains)
    .where(eq(custom_domains.organizationId, organizationId));

  return domains as CustomDomain[];
}

/**
 * Get domain configuration instructions
 */
export function getDNSInstructions(domain: CustomDomain): string {
  const dnsConfig = domain.dnsConfig;

  if (!dnsConfig) {
    return 'DNS configuration not available';
  }

  return `
To configure your domain ${domain.domain}, add the following DNS record:

Type: ${dnsConfig.type}
Name: ${dnsConfig.name || '@'}
Value: ${dnsConfig.value}
TTL: ${dnsConfig.ttl || 3600}

Verification Token (TXT Record):
Type: TXT
Name: _aiverify.${domain.domain}
Value: ${domain.verificationToken}

After adding these records, click "Verify Domain" to complete setup.
  `.trim();
}

/**
 * Generate verification token
 */
function generateVerificationToken(): string {
  return `ai-verify-${randomBytes(16).toString('hex')}`;
}

/**
 * Validate domain format
 */
function isValidDomain(domain: string): boolean {
  const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9](?:\.[a-zA-Z]{2,})+$/;
  return domainRegex.test(domain);
}

/**
 * Generate DNS configuration based on domain
 */
function generateDNSConfig(domain: string): DNSConfig {
  // For most cases, use CNAME pointing to the platform
  return {
    type: 'CNAME',
    name: domain.split('.')[0],
    value: 'domains.aidepedia.io',
    ttl: 3600,
  };
}

/**
 * Check DNS verification
 * In production, this would actually query DNS servers
 */
async function checkDNSVerification(domain: string, token: string): Promise<boolean> {
  // Simulate DNS check - in production, use a DNS resolver library
  // For demo purposes, we'll return true after a delay
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // In production:
  // const records = await dns.resolveTxt(`_aiverify.${domain}`);
  // return records.some(record => record.includes(token));
  
  return true; // Simplified for demo
}

/**
 * Request SSL certificate
 * In production, this would integrate with AWS ACM or Let's Encrypt
 */
async function requestSSLCertificate(domain: string): Promise<string> {
  // Simulate SSL certificate request
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // In production:
  // const acm = new AWS.ACM();
  // const result = await acm.requestCertificate({...}).promise();
  // return result.CertificateArn;
  
  return `arn:aws:acm:us-east-1:123456789:certificate/${randomBytes(16).toString('hex')}`;
}

/**
 * Log domain verification attempts
 */
async function logDomainVerification(
  domainId: number,
  attemptType: 'dns_check' | 'ssl_provision' | 'ssl_renew' | 'domain_verify',
  status: 'success' | 'failed' | 'pending',
  details?: any
): Promise<void> {
  await db.insert(domain_verification_logs).values({
    domainId,
    attemptType,
    status,
    details,
    errorMessage: details?.error,
  });
}

/**
 * Renew SSL certificate (for certificates about to expire)
 */
export async function renewSSLCertificate(domainId: number): Promise<void> {
  const [domain] = await db
    .select()
    .from(custom_domains)
    .where(eq(custom_domains.id, domainId))
    .limit(1);

  if (!domain || !domain.sslExpiresAt) {
    throw new Error('Domain not found or no SSL certificate');
  }

  // Check if renewal is needed (within 30 days of expiry)
  const daysUntilExpiry = Math.ceil(
    (domain.sslExpiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  if (daysUntilExpiry > 30) {
    throw new Error('SSL certificate renewal not needed yet');
  }

  await provisionSSL(domainId);

  await logDomainVerification(domainId, 'ssl_renew', 'success');
}

/**
 * Check domain health and status
 */
export async function checkDomainHealth(domainId: number): Promise<{
  healthy: boolean;
  issues: string[];
}> {
  const [domain] = await db
    .select()
    .from(custom_domains)
    .where(eq(custom_domains.id, domainId))
    .limit(1);

  if (!domain) {
    throw new Error('Domain not found');
  }

  const issues: string[] = [];

  // Check verification status
  if (domain.verificationStatus !== 'verified') {
    issues.push('Domain not verified');
  }

  // Check SSL status
  if (domain.sslStatus !== 'active') {
    issues.push('SSL certificate not active');
  }

  // Check SSL expiry
  if (domain.sslExpiresAt && domain.sslExpiresAt < new Date()) {
    issues.push('SSL certificate expired');
  } else if (domain.sslExpiresAt) {
    const daysUntilExpiry = Math.ceil(
      (domain.sslExpiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    if (daysUntilExpiry < 30) {
      issues.push(`SSL certificate expires in ${daysUntilExpiry} days`);
    }
  }

  // Update last check time
  await db
    .update(custom_domains)
    .set({ lastCheckAt: new Date() })
    .where(eq(custom_domains.id, domainId));

  return {
    healthy: issues.length === 0,
    issues,
  };
}

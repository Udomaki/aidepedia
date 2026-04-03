import { eq, and, desc, gt, lt, isNull, isNotNull, inArray, sql } from 'drizzle-orm';
import { db } from '../index';
import {
  ssoSessions,
  scimGroups,
  scimGroupMembers,
  ssoAuditLog,
  ssoIdentityProviders,
  organizations,
  users,
  organization_members,
} from '../schema/index';
import type {
  SsoSession,
  NewSsoSession,
  ScimGroup,
  NewScimGroup,
  ScimGroupMember,
  NewScimGroupMember,
  SsoAuditLog,
  NewSsoAuditLog,
  SsoIdentityProvider,
  NewSsoIdentityProvider,
  SsoConfiguration,
  DomainSsoDetection,
  SsoStats,
} from '../types/sso';
import { NotFoundError, DatabaseError } from '../types';

// ========================================
// Identity Provider Queries
// ========================================

/**
 * Get all identity providers for an organization
 */
export async function getIdentityProviders(organizationId: number): Promise<SsoIdentityProvider[]> {
  try {
    return await db
      .select()
      .from(ssoIdentityProviders)
      .where(eq(ssoIdentityProviders.organizationId, organizationId))
      .orderBy(ssoIdentityProviders.priority);
  } catch (error) {
    throw new DatabaseError(`Failed to get identity providers: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get an identity provider by ID
 */
export async function getIdentityProviderById(id: number): Promise<SsoIdentityProvider> {
  try {
    const [provider] = await db
      .select()
      .from(ssoIdentityProviders)
      .where(eq(ssoIdentityProviders.id, id))
      .limit(1);

    if (!provider) {
      throw new NotFoundError('Identity Provider', `id:${id}`);
    }

    return provider;
  } catch (error) {
    if (error instanceof NotFoundError) throw error;
    throw new DatabaseError(`Failed to get identity provider: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get identity provider by domain
 */
export async function getIdentityProviderByDomain(domain: string): Promise<SsoIdentityProvider | undefined> {
  try {
    const [provider] = await db
      .select()
      .from(ssoIdentityProviders)
      .where(and(
        eq(ssoIdentityProviders.domain, domain),
        eq(ssoIdentityProviders.isActive, true)
      ))
      .orderBy(ssoIdentityProviders.priority)
      .limit(1);

    return provider;
  } catch (error) {
    throw new DatabaseError(`Failed to get identity provider by domain: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Create an identity provider
 */
export async function createIdentityProvider(data: NewSsoIdentityProvider): Promise<SsoIdentityProvider> {
  try {
    const [provider] = await db
      .insert(ssoIdentityProviders)
      .values(data)
      .returning();

    return provider;
  } catch (error) {
    throw new DatabaseError(`Failed to create identity provider: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Update an identity provider
 */
export async function updateIdentityProvider(id: number, data: Partial<NewSsoIdentityProvider>): Promise<SsoIdentityProvider> {
  try {
    const [provider] = await db
      .update(ssoIdentityProviders)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(ssoIdentityProviders.id, id))
      .returning();

    if (!provider) {
      throw new NotFoundError('Identity Provider', `id:${id}`);
    }

    return provider;
  } catch (error) {
    if (error instanceof NotFoundError) throw error;
    throw new DatabaseError(`Failed to update identity provider: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Delete an identity provider
 */
export async function deleteIdentityProvider(id: number): Promise<void> {
  try {
    const [deleted] = await db
      .delete(ssoIdentityProviders)
      .where(eq(ssoIdentityProviders.id, id))
      .returning();

    if (!deleted) {
      throw new NotFoundError('Identity Provider', `id:${id}`);
    }
  } catch (error) {
    if (error instanceof NotFoundError) throw error;
    throw new DatabaseError(`Failed to delete identity provider: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// ========================================
// SSO Session Queries
// ========================================

/**
 * Create an SSO session
 */
export async function createSsoSession(data: NewSsoSession): Promise<SsoSession> {
  try {
    const [session] = await db
      .insert(ssoSessions)
      .values(data)
      .returning();

    return session;
  } catch (error) {
    throw new DatabaseError(`Failed to create SSO session: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get active SSO session for a user
 */
export async function getActiveSsoSession(userId: number): Promise<SsoSession | undefined> {
  try {
    const [session] = await db
      .select()
      .from(ssoSessions)
      .where(and(
        eq(ssoSessions.userId, userId),
        gt(ssoSessions.expiresAt, new Date())
      ))
      .orderBy(desc(ssoSessions.createdAt))
      .limit(1);

    return session;
  } catch (error) {
    throw new DatabaseError(`Failed to get active SSO session: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Delete SSO sessions for a user (logout)
 */
export async function deleteSsoSessions(userId: number): Promise<void> {
  try {
    await db
      .delete(ssoSessions)
      .where(eq(ssoSessions.userId, userId));
  } catch (error) {
    throw new DatabaseError(`Failed to delete SSO sessions: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Clean up expired SSO sessions
 */
export async function cleanupExpiredSsoSessions(): Promise<number> {
  try {
    const result = await db
      .delete(ssoSessions)
      .where(lt(ssoSessions.expiresAt, new Date()))
      .returning();

    return result.length;
  } catch (error) {
    throw new DatabaseError(`Failed to cleanup expired SSO sessions: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// ========================================
// SCIM Group Queries
// ========================================

/**
 * Get SCIM groups for an organization
 */
export async function getScimGroups(organizationId: number): Promise<ScimGroup[]> {
  try {
    return await db
      .select()
      .from(scimGroups)
      .where(eq(scimGroups.organizationId, organizationId))
      .orderBy(scimGroups.displayName);
  } catch (error) {
    throw new DatabaseError(`Failed to get SCIM groups: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get SCIM group by external ID
 */
export async function getScimGroupByExternalId(organizationId: number, externalId: string): Promise<ScimGroup | undefined> {
  try {
    const [group] = await db
      .select()
      .from(scimGroups)
      .where(and(
        eq(scimGroups.organizationId, organizationId),
        eq(scimGroups.externalId, externalId)
      ))
      .limit(1);

    return group;
  } catch (error) {
    throw new DatabaseError(`Failed to get SCIM group by external ID: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Create or update SCIM group
 */
export async function upsertScimGroup(organizationId: number, externalId: string, displayName: string, mappedRole?: string): Promise<ScimGroup> {
  try {
    const existing = await getScimGroupByExternalId(organizationId, externalId);

    if (existing) {
      const [updated] = await db
        .update(scimGroups)
        .set({
          displayName,
          mappedRole,
          updatedAt: new Date(),
        })
        .where(eq(scimGroups.id, existing.id))
        .returning();

      return updated;
    } else {
      const [created] = await db
        .insert(scimGroups)
        .values({
          organizationId,
          externalId,
          displayName,
          mappedRole,
        })
        .returning();

      return created;
    }
  } catch (error) {
    throw new DatabaseError(`Failed to upsert SCIM group: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Add user to SCIM group
 */
export async function addScimGroupMember(groupId: number, userId: number): Promise<ScimGroupMember> {
  try {
    const [member] = await db
      .insert(scimGroupMembers)
      .values({ groupId, userId })
      .onConflictDoNothing()
      .returning();

    return member;
  } catch (error) {
    throw new DatabaseError(`Failed to add SCIM group member: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Remove user from SCIM group
 */
export async function removeScimGroupMember(groupId: number, userId: number): Promise<void> {
  try {
    await db
      .delete(scimGroupMembers)
      .where(and(
        eq(scimGroupMembers.groupId, groupId),
        eq(scimGroupMembers.userId, userId)
      ));
  } catch (error) {
    throw new DatabaseError(`Failed to remove SCIM group member: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Sync SCIM group members
 */
export async function syncScimGroupMembers(groupId: number, userIds: number[]): Promise<void> {
  try {
    // Get current members
    const currentMembers = await db
      .select()
      .from(scimGroupMembers)
      .where(eq(scimGroupMembers.groupId, groupId));

    const currentMemberIds = currentMembers.map(m => m.userId);
    const toAdd = userIds.filter(id => !currentMemberIds.includes(id));
    const toRemove = currentMemberIds.filter(id => !userIds.includes(id));

    // Add new members
    if (toAdd.length > 0) {
      await db
        .insert(scimGroupMembers)
        .values(toAdd.map(userId => ({ groupId, userId })))
        .onConflictDoNothing();
    }

    // Remove old members
    if (toRemove.length > 0) {
      await db
        .delete(scimGroupMembers)
        .where(and(
          eq(scimGroupMembers.groupId, groupId),
          inArray(scimGroupMembers.userId, toRemove)
        ));
    }
  } catch (error) {
    throw new DatabaseError(`Failed to sync SCIM group members: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// ========================================
// SSO Audit Log Queries
// ========================================

/**
 * Create SSO audit log entry
 */
export async function createSsoAuditLog(data: NewSsoAuditLog): Promise<SsoAuditLog> {
  try {
    const [log] = await db
      .insert(ssoAuditLog)
      .values(data)
      .returning();

    return log;
  } catch (error) {
    throw new DatabaseError(`Failed to create SSO audit log: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get SSO audit logs for an organization
 */
export async function getSsoAuditLogs(
  organizationId: number,
  limit: number = 100,
  offset: number = 0
): Promise<SsoAuditLog[]> {
  try {
    return await db
      .select()
      .from(ssoAuditLog)
      .where(eq(ssoAuditLog.organizationId, organizationId))
      .orderBy(desc(ssoAuditLog.createdAt))
      .limit(limit)
      .offset(offset);
  } catch (error) {
    throw new DatabaseError(`Failed to get SSO audit logs: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// ========================================
// Organization SSO Configuration
// ========================================

/**
 * Get SSO configuration for an organization
 */
export async function getSsoConfiguration(organizationId: number): Promise<SsoConfiguration | undefined> {
  try {
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    if (!org) {
      return undefined;
    }

    const config: SsoConfiguration = {
      organizationId: org.id,
      ssoEnabled: org.ssoEnabled ?? false,
      ssoRequired: org.ssoRequired ?? false,
      ssoProvider: org.ssoProvider ?? undefined,
    };

    if (org.ssoProvider === 'saml' || org.ssoProvider === 'both') {
      config.saml = {
        metadataUrl: org.samlMetadataUrl ?? undefined,
        metadataXml: org.samlMetadataXml ?? undefined,
        entryPoint: org.samlEntryPoint ?? undefined,
        certificate: org.samlCertificate ?? undefined,
        issuer: org.samlIssuer ?? undefined,
      };
    }

    if (org.ssoProvider === 'oidc' || org.ssoProvider === 'both') {
      config.oidc = {
        clientId: org.oidcClientId ?? undefined,
        clientSecret: org.oidcClientSecret ?? undefined,
        discoveryUrl: org.oidcDiscoveryUrl ?? undefined,
        issuer: org.oidcIssuer ?? undefined,
        authorizationEndpoint: org.oidcAuthorizationEndpoint ?? undefined,
        tokenEndpoint: org.oidcTokenEndpoint ?? undefined,
        userInfoEndpoint: org.oidcUserInfoEndpoint ?? undefined,
        jwksUri: org.oidcJwksUri ?? undefined,
      };
    }

    if (org.scimEnabled) {
      config.scim = {
        enabled: true,
        bearerToken: org.scimBearerToken ?? undefined,
      };
    }

    return config;
  } catch (error) {
    throw new DatabaseError(`Failed to get SSO configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Detect SSO by email domain
 */
export async function detectSsoByEmail(email: string): Promise<DomainSsoDetection | undefined> {
  try {
    const domain = email.split('@')[1];
    if (!domain) return undefined;

    const [org] = await db
      .select()
      .from(organizations)
      .where(and(
        eq(organizations.domain, domain),
        eq(organizations.ssoEnabled, true)
      ))
      .limit(1);

    if (!org) return undefined;

    const providers = await getIdentityProviders(org.id);

    return {
      domain,
      organizationId: org.id,
      organizationName: org.name,
      identityProviders: providers.map(p => ({
        id: p.id,
        name: p.name,
        type: p.type as 'saml' | 'oidc',
        isActive: p.isActive ?? true,
      })),
    };
  } catch (error) {
    throw new DatabaseError(`Failed to detect SSO by email: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get organization by domain
 */
export async function getOrganizationByDomain(domain: string): Promise<typeof organizations.$inferSelect | undefined> {
  try {
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.domain, domain))
      .limit(1);

    return org;
  } catch (error) {
    throw new DatabaseError(`Failed to get organization by domain: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// ========================================
// SSO Statistics
// ========================================

/**
 * Get SSO statistics for an organization
 */
export async function getSsoStats(organizationId: number): Promise<SsoStats> {
  try {
    const [totalSessionsResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(ssoSessions)
      .where(eq(ssoSessions.organizationId, organizationId));

    const [activeSessionsResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(ssoSessions)
      .where(and(
        eq(ssoSessions.organizationId, organizationId),
        gt(ssoSessions.expiresAt, new Date())
      ));

    const [samlLoginsResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(ssoAuditLog)
      .where(and(
        eq(ssoAuditLog.organizationId, organizationId),
        eq(ssoAuditLog.eventType, 'saml_assertion_received')
      ));

    const [oidcLoginsResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(ssoAuditLog)
      .where(and(
        eq(ssoAuditLog.organizationId, organizationId),
        eq(ssoAuditLog.eventType, 'oidc_token_received')
      ));

    const [failedLoginsResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(ssoAuditLog)
      .where(and(
        eq(ssoAuditLog.organizationId, organizationId),
        eq(ssoAuditLog.eventType, 'sso_login_failed')
      ));

    const [scimProvisionedResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(ssoAuditLog)
      .where(and(
        eq(ssoAuditLog.organizationId, organizationId),
        eq(ssoAuditLog.eventType, 'scim_user_provisioned')
      ));

    const [scimGroupsResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(scimGroups)
      .where(eq(scimGroups.organizationId, organizationId));

    const [idpsResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(ssoIdentityProviders)
      .where(eq(ssoIdentityProviders.organizationId, organizationId));

    return {
      totalSessions: totalSessionsResult?.count ?? 0,
      activeSessions: activeSessionsResult?.count ?? 0,
      samlLogins: samlLoginsResult?.count ?? 0,
      oidcLogins: oidcLoginsResult?.count ?? 0,
      failedLogins: failedLoginsResult?.count ?? 0,
      scimProvisionedUsers: scimProvisionedResult?.count ?? 0,
      scimGroups: scimGroupsResult?.count ?? 0,
      identityProviders: idpsResult?.count ?? 0,
    };
  } catch (error) {
    throw new DatabaseError(`Failed to get SSO stats: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// ========================================
// SCIM User Management
// ========================================

/**
 * Find user by email
 */
export async function findUserByEmail(email: string): Promise<typeof users.$inferSelect | undefined> {
  try {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    return user;
  } catch (error) {
    throw new DatabaseError(`Failed to find user by email: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Create or update user from SCIM
 */
export async function upsertScimUser(
  organizationId: number,
  email: string,
  name?: string,
  externalId?: string
): Promise<typeof users.$inferSelect> {
  try {
    let user = await findUserByEmail(email);

    if (!user) {
      // Create user
      const [newUser] = await db
        .insert(users)
        .values({
          email,
          name,
        })
        .returning();

      user = newUser;

      // Add to organization
      await db
        .insert(organization_members)
        .values({
          organizationId,
          userId: user.id,
          role: 'member',
          scimExternalId: externalId,
          scimSyncedAt: new Date(),
        });
    } else {
      // Update user
      const [updatedUser] = await db
        .update(users)
        .set({
          name: name ?? user.name,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id))
        .returning();

      user = updatedUser;

      // Check if already in organization
      const [membership] = await db
        .select()
        .from(organization_members)
        .where(and(
          eq(organization_members.organizationId, organizationId),
          eq(organization_members.userId, user.id)
        ))
        .limit(1);

      if (!membership) {
        // Add to organization
        await db
          .insert(organization_members)
          .values({
            organizationId,
            userId: user.id,
            role: 'member',
            scimExternalId: externalId,
            scimSyncedAt: new Date(),
          });
      } else {
        // Update SCIM metadata
        await db
          .update(organization_members)
          .set({
            scimExternalId: externalId,
            scimSyncedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(organization_members.id, membership.id));
      }
    }

    return user;
  } catch (error) {
    throw new DatabaseError(`Failed to upsert SCIM user: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Deactivate user (SCIM deprovisioning)
 */
export async function deactivateScimUser(organizationId: number, externalId: string): Promise<void> {
  try {
    const [membership] = await db
      .select()
      .from(organization_members)
      .where(and(
        eq(organization_members.organizationId, organizationId),
        eq(organization_members.scimExternalId, externalId)
      ))
      .limit(1);

    if (membership) {
      await db
        .delete(organization_members)
        .where(eq(organization_members.id, membership.id));
    }
  } catch (error) {
    throw new DatabaseError(`Failed to deactivate SCIM user: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

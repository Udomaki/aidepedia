import { pgTable, serial, varchar, text, integer, timestamp, boolean, jsonb, index } from 'drizzle-orm/pg-core';
import { users } from './index';

// Organizations for enterprise SSO
export const organizations = pgTable('organizations', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  domain: varchar('domain', { length: 255 }).notNull().unique(),
  
  // SSO Configuration
  ssoEnabled: boolean('sso_enabled').default(false),
  ssoRequired: boolean('sso_required').default(false), // If true, users MUST use SSO
  ssoProvider: varchar('sso_provider', { 
    enum: ['saml', 'oidc', 'both'],
    length: 10 
  }),
  
  // SAML Configuration
  samlMetadataUrl: text('saml_metadata_url'),
  samlMetadataXml: text('saml_metadata_xml'), // Raw XML metadata
  samlEntryPoint: text('saml_entry_point'),
  samlCertificate: text('saml_certificate'),
  samlIssuer: varchar('saml_issuer', { length: 255 }),
  
  // OIDC Configuration
  oidcClientId: varchar('oidc_client_id', { length: 255 }),
  oidcClientSecret: varchar('oidc_client_secret', { length: 500 }),
  oidcDiscoveryUrl: text('oidc_discovery_url'),
  oidcIssuer: varchar('oidc_issuer', { length: 255 }),
  oidcAuthorizationEndpoint: text('oidc_authorization_endpoint'),
  oidcTokenEndpoint: text('oidc_token_endpoint'),
  oidcUserInfoEndpoint: text('oidc_user_info_endpoint'),
  oidcJwksUri: text('oidc_jwks_uri'),
  
  // SCIM Configuration
  scimEnabled: boolean('scim_enabled').default(false),
  scimBearerToken: varchar('scim_bearer_token', { length: 255 }),
  
  // Branding
  logoUrl: varchar('logo_url', { length: 500 }),
  primaryColor: varchar('primary_color', { length: 7 }), // Hex color
  
  // Metadata
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  slugIdx: index('org_slug_idx').on(table.slug),
  domainIdx: index('org_domain_idx').on(table.domain),
  ssoEnabledIdx: index('org_sso_enabled_idx').on(table.ssoEnabled),
}));

// Organization membership
export const organizationMembers = pgTable('organization_members', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: varchar('role', { 
    enum: ['member', 'admin', 'owner'],
    length: 20 
  }).default('member'),
  
  // SCIM metadata
  scimExternalId: varchar('scim_external_id', { length: 255 }),
  scimSyncedAt: timestamp('scim_synced_at'),
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  orgUserIdx: index('org_member_org_user_idx').on(table.organizationId, table.userId),
  userIdx: index('org_member_user_idx').on(table.userId),
  scimExternalIdIdx: index('org_member_scim_id_idx').on(table.scimExternalId),
}));

// SSO Sessions for tracking
export const ssoSessions = pgTable('sso_sessions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  organizationId: integer('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  
  provider: varchar('provider', { 
    enum: ['saml', 'oidc'],
    length: 10 
  }).notNull(),
  
  // Session details
  sessionIndex: varchar('session_index', { length: 255 }), // SAML session index
  nameId: varchar('name_id', { length: 255 }), // SAML NameID
  idToken: text('id_token'), // OIDC ID token
  accessToken: text('access_token'), // OIDC access token
  refreshToken: text('refresh_token'),
  
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  userIdx: index('sso_session_user_idx').on(table.userId),
  orgIdx: index('sso_session_org_idx').on(table.organizationId),
  expiresIdx: index('sso_session_expires_idx').on(table.expiresAt),
}));

// SCIM Groups
export const scimGroups = pgTable('scim_groups', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  externalId: varchar('external_id', { length: 255 }).notNull(),
  displayName: varchar('display_name', { length: 255 }).notNull(),
  
  // Mapping to application roles
  mappedRole: varchar('mapped_role', { length: 50 }),
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  orgExternalIdx: index('scim_group_org_external_idx').on(table.organizationId, table.externalId),
  orgIdx: index('scim_group_org_idx').on(table.organizationId),
}));

// SCIM Group Memberships
export const scimGroupMembers = pgTable('scim_group_members', {
  id: serial('id').primaryKey(),
  groupId: integer('group_id').notNull().references(() => scimGroups.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  groupUserIdx: index('scim_group_member_group_user_idx').on(table.groupId, table.userId),
  userIdx: index('scim_group_member_user_idx').on(table.userId),
}));

// SSO Audit Log
export const ssoAuditLog = pgTable('sso_audit_log', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id').references(() => organizations.id, { onDelete: 'set null' }),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  
  eventType: varchar('event_type', {
    enum: [
      'sso_login_success',
      'sso_login_failed',
      'sso_logout',
      'saml_assertion_received',
      'oidc_token_received',
      'scim_user_provisioned',
      'scim_user_updated',
      'scim_user_deprovisioned',
      'scim_group_synced',
      'sso_enforcement_triggered',
      'domain_based_sso_detected',
    ],
    length: 30
  }).notNull(),
  
  provider: varchar('provider', { length: 10 }),
  success: boolean('success'),
  errorMessage: text('error_message'),
  
  // Request metadata
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: varchar('user_agent', { length: 500 }),
  
  // Additional event data
  eventData: jsonb('event_data'),
  
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  orgIdx: index('sso_audit_org_idx').on(table.organizationId),
  userIdx: index('sso_audit_user_idx').on(table.userId),
  eventTypeIdx: index('sso_audit_event_type_idx').on(table.eventType),
  createdAtIdx: index('sso_audit_created_at_idx').on(table.createdAt),
}));

// SSO Identity Provider configurations (for multi-IdP support)
export const ssoIdentityProviders = pgTable('sso_identity_providers', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  
  name: varchar('name', { length: 255 }).notNull(), // e.g., "Okta", "Azure AD", "Google"
  type: varchar('type', { 
    enum: ['saml', 'oidc'],
    length: 10 
  }).notNull(),
  
  // For domain-based detection
  domain: varchar('domain', { length: 255 }),
  
  // SAML-specific
  samlMetadataUrl: text('saml_metadata_url'),
  samlMetadataXml: text('saml_metadata_xml'),
  samlEntryPoint: text('saml_entry_point'),
  samlCertificate: text('saml_certificate'),
  samlIssuer: varchar('saml_issuer', { length: 255 }),
  
  // OIDC-specific
  oidcClientId: varchar('oidc_client_id', { length: 255 }),
  oidcClientSecret: varchar('oidc_client_secret', { length: 500 }),
  oidcDiscoveryUrl: text('oidc_discovery_url'),
  oidcIssuer: varchar('oidc_issuer', { length: 255 }),
  
  // Priority for domain-based detection (lower = higher priority)
  priority: integer('priority').default(100),
  
  isActive: boolean('is_active').default(true),
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  orgIdx: index('idp_org_idx').on(table.organizationId),
  domainIdx: index('idp_domain_idx').on(table.domain),
  typeIdx: index('idp_type_idx').on(table.type),
}));

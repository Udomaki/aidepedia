import { pgTable, serial, varchar, text, integer, timestamp, boolean, index, jsonb } from 'drizzle-orm/pg-core';
import { users } from './index';

// Organizations table for multi-tenant white-labeling and SSO
export const organizations = pgTable('organizations', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  description: text('description'),
  
  // Owner and plan info
  ownerId: integer('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  plan: varchar('plan', {
    enum: ['free', 'starter', 'professional', 'enterprise'],
    length: 20
  }).notNull().default('free'),
  
  // White-label feature flag
  whiteLabelEnabled: boolean('white_label_enabled').default(false),
  
  // SSO Configuration
  domain: varchar('domain', { length: 255 }).unique(),
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
  logoUrl: varchar('logo_url', { length: 1000 }),
  primaryColor: varchar('primary_color', { length: 7 }), // Hex color
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  slugIdx: index('organization_slug_idx').on(table.slug),
  ownerIdx: index('organization_owner_idx').on(table.ownerId),
  planIdx: index('organization_plan_idx').on(table.plan),
  domainIdx: index('org_domain_idx').on(table.domain),
  ssoEnabledIdx: index('org_sso_enabled_idx').on(table.ssoEnabled),
}));

// Organization members
export const organization_members = pgTable('organization_members', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: varchar('role', {
    enum: ['owner', 'admin', 'member', 'viewer'],
    length: 20
  }).notNull().default('member'),
  
  // SCIM metadata
  scimExternalId: varchar('scim_external_id', { length: 255 }),
  scimSyncedAt: timestamp('scim_synced_at'),
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  organizationIdx: index('member_organization_idx').on(table.organizationId),
  userIdx: index('member_user_idx').on(table.userId),
  orgUserIdx: index('member_org_user_idx').on(table.organizationId, table.userId),
  scimExternalIdIdx: index('org_member_scim_id_idx').on(table.scimExternalId),
}));

// Organization branding settings
export const organization_branding = pgTable('organization_branding', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }).unique(),
  
  // Logo and visual identity
  logoUrl: varchar('logo_url', { length: 1000 }),
  logoDarkUrl: varchar('logo_dark_url', { length: 1000 }),
  faviconUrl: varchar('favicon_url', { length: 1000 }),
  
  // Color scheme
  primaryColor: varchar('primary_color', { length: 7 }).default('#3B82F6'),
  secondaryColor: varchar('secondary_color', { length: 7 }).default('#1E40AF'),
  accentColor: varchar('accent_color', { length: 7 }).default('#F59E0B'),
  backgroundColor: varchar('background_color', { length: 7 }).default('#FFFFFF'),
  textColor: varchar('text_color', { length: 7 }).default('#1F2937'),
  
  // Typography
  fontHeading: varchar('font_heading', { length: 100 }).default('Inter'),
  fontBody: varchar('font_body', { length: 100 }).default('Inter'),
  
  // Custom CSS
  customCss: text('custom_css'),
  
  // Theme preset
  themePreset: varchar('theme_preset', {
    enum: ['light', 'dark', 'custom'],
    length: 20
  }).default('light'),
  
  // Advanced theme settings
  themeConfig: jsonb('theme_config').$type<{
    borderRadius?: string;
    buttonStyle?: 'rounded' | 'square' | 'pill';
    cardStyle?: 'elevated' | 'outlined' | 'flat';
    headerStyle?: 'fixed' | 'static' | 'minimal';
  }>(),
  
  // Brand metadata
  brandName: varchar('brand_name', { length: 255 }),
  brandTagline: varchar('brand_tagline', { length: 500 }),
  brandDescription: text('brand_description'),
  
  // Social links
  socialLinks: jsonb('social_links').$type<{
    twitter?: string;
    linkedin?: string;
    github?: string;
    discord?: string;
    website?: string;
  }>(),
  
  // Footer customization
  footerText: text('footer_text'),
  footerLinks: jsonb('footer_links').$type<Array<{ label: string; url: string }>>(),
  showPoweredBy: boolean('show_powered_by').default(true),
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  organizationIdx: index('branding_organization_idx').on(table.organizationId),
  themeIdx: index('branding_theme_idx').on(table.themePreset),
}));

// Custom domains for white-labeling
export const custom_domains = pgTable('custom_domains', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  
  // Domain configuration
  domain: varchar('domain', { length: 255 }).notNull().unique(),
  isPrimary: boolean('is_primary').default(false),
  
  // SSL Certificate status
  sslStatus: varchar('ssl_status', {
    enum: ['pending', 'provisioning', 'active', 'failed', 'expired'],
    length: 20
  }).default('pending'),
  sslProvider: varchar('ssl_provider', { length: 50 }).default('letsencrypt'),
  sslCertificateArn: varchar('ssl_certificate_arn', { length: 500 }),
  sslExpiresAt: timestamp('ssl_expires_at'),
  
  // DNS verification
  verificationStatus: varchar('verification_status', {
    enum: ['pending', 'verified', 'failed'],
    length: 20
  }).default('pending'),
  verificationToken: varchar('verification_token', { length: 255 }),
  verifiedAt: timestamp('verified_at'),
  
  // DNS configuration
  dnsConfig: jsonb('dns_config').$type<{
    type: 'A' | 'CNAME' | 'ALIAS';
    name: string;
    value: string;
    ttl?: number;
  }>(),
  
  // Status
  isActive: boolean('is_active').default(false),
  
  // Metadata
  provisionedAt: timestamp('provisioned_at'),
  lastCheckAt: timestamp('last_check_at'),
  errorMessage: text('error_message'),
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  organizationIdx: index('domain_organization_idx').on(table.organizationId),
  domainIdx: index('domain_domain_idx').on(table.domain),
  sslStatusIdx: index('domain_ssl_status_idx').on(table.sslStatus),
  verificationIdx: index('domain_verification_idx').on(table.verificationStatus),
}));

// Email templates for organization branding
export const email_templates = pgTable('email_templates', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  
  // Template metadata
  name: varchar('name', { length: 255 }).notNull(),
  type: varchar('type', {
    enum: ['welcome', 'password_reset', 'email_verification', 'notification', 'digest', 'custom'],
    length: 30
  }).notNull(),
  
  // Email content
  subject: varchar('subject', { length: 500 }).notNull(),
  htmlContent: text('html_content').notNull(),
  textContent: text('text_content'),
  
  // Email styling
  headerLogo: varchar('header_logo', { length: 1000 }),
  backgroundColor: varchar('background_color', { length: 7 }).default('#F3F4F6'),
  accentColor: varchar('accent_color', { length: 7 }).default('#3B82F6'),
  textColor: varchar('text_color', { length: 7 }).default('#1F2937'),
  
  // Footer
  footerText: text('footer_text'),
  showUnsubscribeLink: boolean('show_unsubscribe_link').default(true),
  
  // Template status
  isDefault: boolean('is_default').default(false),
  isActive: boolean('is_active').default(true),
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  organizationIdx: index('template_organization_idx').on(table.organizationId),
  typeIdx: index('template_type_idx').on(table.type),
  orgTypeIdx: index('template_org_type_idx').on(table.organizationId, table.type),
}));

// Theme presets that can be shared/exported
export const theme_presets = pgTable('theme_presets', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id').references(() => organizations.id, { onDelete: 'cascade' }),
  
  // Preset info
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  isPublic: boolean('is_public').default(false),
  
  // Theme configuration (JSON export of all theme settings)
  config: jsonb('config').notNull().$type<{
    colors: {
      primary: string;
      secondary: string;
      accent: string;
      background: string;
      text: string;
    };
    fonts: {
      heading: string;
      body: string;
    };
    themeConfig: {
      borderRadius?: string;
      buttonStyle?: 'rounded' | 'square' | 'pill';
      cardStyle?: 'elevated' | 'outlined' | 'flat';
      headerStyle?: 'fixed' | 'static' | 'minimal';
    };
    customCss?: string;
  }>(),
  
  // Usage tracking
  useCount: integer('use_count').default(0),
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  organizationIdx: index('preset_organization_idx').on(table.organizationId),
  publicIdx: index('preset_public_idx').on(table.isPublic),
}));

// Domain verification attempts (for debugging)
export const domain_verification_logs = pgTable('domain_verification_logs', {
  id: serial('id').primaryKey(),
  domainId: integer('domain_id').notNull().references(() => custom_domains.id, { onDelete: 'cascade' }),
  
  // Verification attempt details
  attemptType: varchar('attempt_type', {
    enum: ['dns_check', 'ssl_provision', 'ssl_renew', 'domain_verify'],
    length: 20
  }).notNull(),
  
  status: varchar('status', {
    enum: ['success', 'failed', 'pending'],
    length: 20
  }).notNull(),
  
  // Details
  details: jsonb('details').$type<Record<string, unknown>>(),
  errorMessage: text('error_message'),
  
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  domainIdx: index('verification_log_domain_idx').on(table.domainId),
  attemptTypeIdx: index('verification_log_type_idx').on(table.attemptType),
  createdAtIdx: index('verification_log_created_at_idx').on(table.createdAt),
}));

// Branding audit log for tracking changes
export const branding_audit_log = pgTable('branding_audit_log', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  
  // Change details
  action: varchar('action', {
    enum: ['create', 'update', 'delete', 'reset', 'export', 'import'],
    length: 20
  }).notNull(),
  resourceType: varchar('resource_type', {
    enum: ['branding', 'domain', 'email_template', 'theme_preset'],
    length: 30
  }).notNull(),
  resourceId: integer('resource_id'),
  
  // Change data
  changes: jsonb('changes').$type<{
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
  }>(),
  
  // Metadata
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: varchar('user_agent', { length: 500 }),
  
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  organizationIdx: index('branding_audit_organization_idx').on(table.organizationId),
  userIdx: index('branding_audit_user_idx').on(table.userId),
  actionIdx: index('branding_audit_action_idx').on(table.action),
  resourceTypeIdx: index('branding_audit_resource_type_idx').on(table.resourceType),
  createdAtIdx: index('branding_audit_created_at_idx').on(table.createdAt),
}));

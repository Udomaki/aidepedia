import type {
  ssoSessions,
  scimGroups,
  scimGroupMembers,
  ssoAuditLog,
  ssoIdentityProviders,
  organizations,
} from '../schema/sso';

// SSO Session types
export type SsoSession = typeof ssoSessions.$inferSelect;
export type NewSsoSession = typeof ssoSessions.$inferInsert;

// SCIM Group types
export type ScimGroup = typeof scimGroups.$inferSelect;
export type NewScimGroup = typeof scimGroups.$inferInsert;

// SCIM Group Member types
export type ScimGroupMember = typeof scimGroupMembers.$inferSelect;
export type NewScimGroupMember = typeof scimGroupMembers.$inferInsert;

// SSO Audit Log types
export type SsoAuditLog = typeof ssoAuditLog.$inferSelect;
export type NewSsoAuditLog = typeof ssoAuditLog.$inferInsert;

// SSO Identity Provider types
export type SsoIdentityProvider = typeof ssoIdentityProviders.$inferSelect;
export type NewSsoIdentityProvider = typeof ssoIdentityProviders.$inferInsert;

// Organization with SSO config
export type OrganizationWithSso = typeof organizations.$inferSelect;

// SSO Provider types
export type SsoProviderType = 'saml' | 'oidc';

// SSO Event types for audit log
export type SsoEventType = 
  | 'sso_login_success'
  | 'sso_login_failed'
  | 'sso_logout'
  | 'saml_assertion_received'
  | 'oidc_token_received'
  | 'scim_user_provisioned'
  | 'scim_user_updated'
  | 'scim_user_deprovisioned'
  | 'scim_group_synced'
  | 'sso_enforcement_triggered'
  | 'domain_based_sso_detected';

// SSO Configuration for an organization
export interface SsoConfiguration {
  organizationId: number;
  ssoEnabled: boolean;
  ssoRequired: boolean;
  ssoProvider?: 'saml' | 'oidc' | 'both';
  
  // SAML config
  saml?: {
    metadataUrl?: string;
    metadataXml?: string;
    entryPoint?: string;
    certificate?: string;
    issuer?: string;
  };
  
  // OIDC config
  oidc?: {
    clientId?: string;
    clientSecret?: string;
    discoveryUrl?: string;
    issuer?: string;
    authorizationEndpoint?: string;
    tokenEndpoint?: string;
    userInfoEndpoint?: string;
    jwksUri?: string;
  };
  
  // SCIM config
  scim?: {
    enabled: boolean;
    bearerToken?: string;
  };
}

// SAML User attributes extracted from assertion
export interface SamlUserAttributes {
  nameId: string;
  email: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  groups?: string[];
  attributes: Record<string, string | string[]>;
}

// OIDC User info from ID token
export interface OidcUserInfo {
  sub: string;
  email: string;
  name?: string;
  givenName?: string;
  familyName?: string;
  groups?: string[];
  picture?: string;
  emailVerified?: boolean;
}

// SCIM User schema (for SCIM API requests/responses)
export interface ScimUserSchema {
  schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'];
  id?: string;
  externalId?: string;
  userName: string;
  name?: {
    givenName?: string;
    familyName?: string;
    formatted?: string;
  };
  displayName?: string;
  emails?: Array<{
    value: string;
    type?: string;
    primary?: boolean;
  }>;
  active?: boolean;
  groups?: Array<{
    value: string;
    display?: string;
    type?: string;
  }>;
  meta?: {
    resourceType?: string;
    created?: string;
    lastModified?: string;
    location?: string;
  };
}

// SCIM Group schema (for SCIM API requests/responses)
export interface ScimGroupSchema {
  schemas: ['urn:ietf:params:scim:schemas:core:2.0:Group'];
  id?: string;
  externalId?: string;
  displayName: string;
  members?: Array<{
    value: string;
    display?: string;
    type?: string;
  }>;
  meta?: {
    resourceType?: string;
    created?: string;
    lastModified?: string;
    location?: string;
  };
}

// SCIM List Response
export interface ScimListResponse<T> {
  schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'];
  totalResults: number;
  startIndex?: number;
  itemsPerPage?: number;
  Resources: T[];
}

// SCIM Error Response
export interface ScimError {
  schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'];
  status: string;
  detail?: string;
  scimType?: 'invalidFilter' | 'tooMany' | 'uniqueness' | 'mutability' | 'invalidSyntax' | 'invalidPath' | 'noTarget' | 'invalidValue' | 'versioning' | 'sensitive';
}

// Domain-based SSO detection result
export interface DomainSsoDetection {
  domain: string;
  organizationId: number;
  organizationName: string;
  identityProviders: Array<{
    id: number;
    name: string;
    type: SsoProviderType;
    isActive: boolean;
  }>;
}

// SSO Login result
export interface SsoLoginResult {
  success: boolean;
  userId?: number;
  organizationId?: number;
  error?: string;
  redirectTo?: string;
}

// Identity Provider configuration for admin UI
export interface IdentityProviderConfig {
  id?: number;
  organizationId: number;
  name: string;
  type: SsoProviderType;
  domain?: string;
  
  // SAML-specific
  samlMetadataUrl?: string;
  samlMetadataXml?: string;
  samlEntryPoint?: string;
  samlCertificate?: string;
  samlIssuer?: string;
  
  // OIDC-specific
  oidcClientId?: string;
  oidcClientSecret?: string;
  oidcDiscoveryUrl?: string;
  oidcIssuer?: string;
  
  // Settings
  priority: number;
  isActive: boolean;
}

// SSO Statistics
export interface SsoStats {
  totalSessions: number;
  activeSessions: number;
  samlLogins: number;
  oidcLogins: number;
  failedLogins: number;
  scimProvisionedUsers: number;
  scimGroups: number;
  identityProviders: number;
}

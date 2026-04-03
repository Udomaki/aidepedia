# Enterprise SSO (SAML/OIDC) Configuration

This document describes how to configure Enterprise SSO for AIdepedia.

## Environment Variables

Add the following environment variables to your `.env` file:

```bash
# SSO Configuration
SITE_URL=https://your-domain.com

# Database (required for SSO session storage)
DATABASE_URL=postgresql://user:password@host:5432/database

# Optional: Default SAML settings
SAML_ISSUER=aidepedia-saml
SAML_CALLBACK_URL=https://your-domain.com/api/sso/saml/acs
```

## Organization SSO Setup

### 1. Create an Organization

```sql
INSERT INTO organizations (name, slug, domain, sso_enabled, sso_required, sso_provider)
VALUES ('Acme Corp', 'acme-corp', 'acme.com', true, true, 'saml');
```

### 2. Configure SAML (Okta, Azure AD, etc.)

```sql
INSERT INTO sso_identity_providers (
  organization_id,
  name,
  type,
  domain,
  saml_metadata_url,
  saml_entry_point,
  saml_certificate,
  saml_issuer,
  is_active
)
VALUES (
  1,
  'Okta',
  'saml',
  'acme.com',
  'https://acme.okta.com/app/exk123456789/sso/saml/metadata',
  'https://acme.okta.com/app/acme_aidepedia/exk123456789/sso/saml',
  '-----BEGIN CERTIFICATE-----
MIIDpDCCAoygAwIBAgIGAX...
-----END CERTIFICATE-----',
  'https://acme.okta.com/exk123456789',
  true
);
```

### 3. Configure OIDC (Google Workspace, etc.)

```sql
INSERT INTO sso_identity_providers (
  organization_id,
  name,
  type,
  domain,
  oidc_client_id,
  oidc_client_secret,
  oidc_discovery_url,
  oidc_issuer,
  is_active
)
VALUES (
  1,
  'Google Workspace',
  'oidc',
  'acme.com',
  'your-client-id.apps.googleusercontent.com',
  'your-client-secret',
  'https://accounts.google.com/.well-known/openid-configuration',
  'https://accounts.google.com',
  true
);
```

### 4. Enable SCIM Provisioning

```sql
UPDATE organizations
SET 
  scim_enabled = true,
  scim_bearer_token = 'your-secure-token-here'
WHERE id = 1;
```

## SCIM Endpoints

### Base URL
```
https://your-domain.com/api/scim/v2
```

### Authentication
Include a bearer token in the Authorization header:
```
Authorization: Bearer your-scim-bearer-token
```

### User Management

- `GET /Users` - List users
- `GET /Users/{id}` - Get user by ID
- `POST /Users` - Create user
- `PUT /Users/{id}` - Update user
- `DELETE /Users/{id}` - Deprovision user

### Group Management

- `GET /Groups` - List groups
- `POST /Groups` - Create/update group

## SSO Flow

### Domain-Based Detection

1. User enters email on login page
2. System detects organization by email domain
3. If SSO is required, redirects to IdP
4. User authenticates with IdP
5. IdP sends assertion to callback
6. System validates and creates session
7. User is redirected to application

### Manual SSO Initiation

```
POST /api/sso/login
{
  "email": "user@acme.com",
  "callbackUrl": "/dashboard"
}
```

## Audit Logging

All SSO events are logged to the `sso_audit_log` table:

- `sso_login_success` - Successful SSO login
- `sso_login_failed` - Failed SSO login
- `saml_assertion_received` - SAML assertion processed
- `oidc_token_received` - OIDC token received
- `scim_user_provisioned` - User created via SCIM
- `scim_user_updated` - User updated via SCIM
- `scim_user_deprovisioned` - User removed via SCIM
- `scim_group_synced` - Group synchronized via SCIM
- `sso_enforcement_triggered` - SSO enforcement activated
- `domain_based_sso_detected` - SSO detected by domain

### Query Audit Logs

```bash
GET /api/sso/audit-logs?organizationId=1&limit=100
```

### Get Statistics

```bash
GET /api/sso/audit-logs/stats?organizationId=1
```

## IdP Configuration Guides

### Okta (SAML)

1. Create SAML application in Okta
2. Set Single Sign On URL: `https://your-domain.com/api/sso/saml/acs`
3. Set Audience URI: `aidepedia-saml`
4. Configure attribute mappings:
   - Email: `user.email`
   - Name: `user.firstName` + `user.lastName`
   - Groups: `user.groups`

### Azure AD (SAML)

1. Create enterprise application in Azure AD
2. Set Identifier: `aidepedia-saml`
3. Set Reply URL: `https://your-domain.com/api/sso/saml/acs`
4. Configure user attributes:
   - `user.mail` → `email`
   - `user.displayname` → `name`

### Google Workspace (OIDC)

1. Create OAuth 2.0 credentials in Google Cloud Console
2. Set authorized redirect URI: `https://your-domain.com/api/sso/oidc/callback`
3. Enable Google Workspace APIs
4. Configure domain-wide delegation

## Security Considerations

1. **HTTPS Required**: All SSO endpoints require HTTPS in production
2. **Token Security**: Store SAML certificates and OIDC secrets securely
3. **Session Management**: SSO sessions expire after 24 hours by default
4. **Audit Logging**: All SSO events are logged for security review
5. **SCIM Tokens**: Use strong, unique bearer tokens for SCIM endpoints

## Troubleshooting

### Common Issues

1. **SAML validation fails**: Check certificate format and issuer
2. **OIDC token invalid**: Verify client ID and secret
3. **User not created**: Check SCIM token and organization membership
4. **Redirect loops**: Verify callback URLs match configuration

### Debug Mode

Enable debug logging:
```bash
DEBUG=saml:* npm run dev
```

### Testing SSO

Use the test endpoints:
```bash
# Check SSO configuration
GET /api/sso/login?email=user@acme.com

# View SAML metadata
GET /api/sso/saml/acs/metadata
```

## Database Migrations

After updating the schema, run migrations:

```bash
pnpm drizzle-kit generate
pnpm drizzle-kit migrate
```

## Support

For enterprise SSO support, contact: enterprise@aidepedia.com

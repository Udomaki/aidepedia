# API Versioning

AIdepedia's API supports versioning for backwards compatibility. This document explains how versioning works and how to migrate between versions.

## Versioning Methods

The API supports two methods for specifying the version:

### 1. URL Path (Recommended)

Include the version in the URL path:

```
GET /api/v1/articles
GET /api/v2/articles (when available)
```

### 2. Header

Use the `X-API-Version` header:

```bash
curl -H "X-API-Version: 1" https://api.aidepedia.com/api/articles
```

**Note:** The header takes precedence over the URL path if both are specified.

## Current Versions

| Version | Status | Release Date | Deprecation Date | Sunset Date |
|---------|--------|--------------|------------------|-------------|
| v1 | Current | 2024-01-15 | - | - |
| v2 | Deprecated | 2025-06-01 | 2026-01-01 | 2026-07-01 |

### Version Status

- **Current**: Active development, fully supported
- **Deprecated**: No new features, security fixes only, will be sunset
- **Sunset**: No longer supported, requests will return 410 Gone

## Deprecation Headers

When using a deprecated version, the API will include these headers:

```
X-API-Version: 2
X-API-Latest-Version: 1
Sunset: Sat, 01 Jul 2026 00:00:00 GMT
Deprecation: true
Link: </docs/api/v2-migration>; rel="deprecation"; type="text/html"
```

### Sunset Response

When a version reaches sunset, all requests will return:

```json
{
  "success": false,
  "error": {
    "code": "VERSION_SUNSET",
    "message": "API version 2 is no longer supported. Please migrate to version 1.",
    "currentVersion": "1"
  }
}
```

HTTP Status: `410 Gone`

## Migration Guide

### Migrating from v2 to v1

If you're currently using v2 (deprecated), here's how to migrate to v1:

#### URL Changes

| v2 Endpoint | v1 Equivalent |
|-------------|---------------|
| `/api/v2/articles?cursor=xxx` | `/api/v1/articles?page=1` |
| `/api/v2/search?filters[status]=published` | `/api/v1/search?q=xxx&status=published` |

#### Pagination

v2 uses cursor-based pagination:

```json
{
  "data": [...],
  "meta": {
    "cursor": "eyJpZCI6MTAwfQ==",
    "hasMore": true
  }
}
```

v1 uses page-based pagination:

```json
{
  "data": [...],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

#### Request Headers

Update your headers:

```diff
- X-API-Version: 2
+ X-API-Version: 1
```

Or update your URL:

```diff
- https://api.aidepedia.com/api/v2/articles
+ https://api.aidepedia.com/api/v1/articles
```

## Admin Endpoints

Admin users can manage API versions:

### List All Versions

```bash
GET /api/v1/admin/versions
Authorization: Bearer <token>
```

Response:

```json
{
  "success": true,
  "data": {
    "versions": [
      {
        "version": "1",
        "status": "current",
        "releaseDate": "2024-01-15",
        "description": "Initial API version"
      },
      {
        "version": "2",
        "status": "deprecated",
        "releaseDate": "2025-06-01",
        "deprecationDate": "2026-01-01",
        "sunsetDate": "2026-07-01",
        "migrationGuide": "/docs/api/v2-migration"
      }
    ],
    "currentVersion": "1",
    "total": 2
  }
}
```

### Get Version Details

```bash
GET /api/v1/admin/versions/2
Authorization: Bearer <token>
```

### Set Deprecation Date

```bash
PATCH /api/v1/admin/versions/2
Authorization: Bearer <token>
Content-Type: application/json

{
  "deprecationDate": "2026-01-01",
  "sunsetDate": "2026-07-01"
}
```

## Best Practices

1. **Always specify the version** - Don't rely on the default version
2. **Monitor deprecation headers** - Watch for `Sunset` and `Deprecation` headers
3. **Subscribe to changelog** - Stay informed about API changes
4. **Test with latest version** - Ensure your code works with the current version
5. **Plan migrations early** - Don't wait until sunset date

## Versioning Policy

- Each major version is supported for at least 12 months after release
- Deprecated versions receive 6 months of security fixes before sunset
- Breaking changes only in major versions
- Minor versions (v1.1, v1.2) are backwards compatible
- At least 3 months notice before sunset

## Support

For questions about API versioning:
- GitHub Issues: https://github.com/Udomaki/aidepedia/issues
- Documentation: https://aidepedia.com/docs/api

/**
 * API Versioning System for AIdepedia
 * 
 * Supports versioning via:
 * - URL path: /api/v1/, /api/v2/
 * - Header: X-API-Version
 * 
 * Includes deprecation management via Sunset headers
 */

export interface ApiVersion {
  version: string;
  status: 'current' | 'deprecated' | 'sunset';
  releaseDate: string;
  deprecationDate?: string;
  sunsetDate?: string;
  description: string;
  changes?: string[];
  migrationGuide?: string;
}

/**
 * API Version Configuration
 */
export const API_VERSIONS: Record<string, ApiVersion> = {
  '1': {
    version: '1',
    status: 'current',
    releaseDate: '2024-01-15',
    description: 'Initial API version with core article and search functionality',
    changes: [
      'Article CRUD operations',
      'Search functionality',
      'Comments and reactions',
      'User profiles',
      'Activity feeds',
    ],
  },
  '2': {
    version: '2',
    status: 'deprecated',
    releaseDate: '2025-06-01',
    deprecationDate: '2026-01-01',
    sunsetDate: '2026-07-01',
    description: 'Enhanced API with improved pagination and filtering',
    changes: [
      'Cursor-based pagination',
      'Advanced filtering options',
      'Bulk operations',
      'Webhook support',
      'Rate limit headers',
    ],
    migrationGuide: '/docs/api/v2-migration',
  },
};

/**
 * Default API version (latest current version)
 */
export const DEFAULT_VERSION = '1';

/**
 * Latest version number
 */
export const LATEST_VERSION = Object.keys(API_VERSIONS)
  .filter(v => API_VERSIONS[v].status === 'current')
  .sort((a, b) => parseInt(b) - parseInt(a))[0] || DEFAULT_VERSION;

/**
 * Get all API versions
 */
export function getAllVersions(): ApiVersion[] {
  return Object.values(API_VERSIONS).sort((a, b) => 
    parseInt(b.version) - parseInt(a.version)
  );
}

/**
 * Get a specific API version
 */
export function getVersion(version: string): ApiVersion | undefined {
  return API_VERSIONS[version];
}

/**
 * Check if a version is valid
 */
export function isValidVersion(version: string): boolean {
  return version in API_VERSIONS;
}

/**
 * Check if a version is deprecated
 */
export function isDeprecated(version: string): boolean {
  const v = API_VERSIONS[version];
  return v?.status === 'deprecated' || v?.status === 'sunset';
}

/**
 * Check if a version is sunset (no longer supported)
 */
export function isSunset(version: string): boolean {
  const v = API_VERSIONS[version];
  return v?.status === 'sunset';
}

/**
 * Get deprecation info for a version
 */
export function getDeprecationInfo(version: string): {
  deprecated: boolean;
  sunsetDate?: string;
  migrationGuide?: string;
} | null {
  const v = API_VERSIONS[version];
  if (!v) return null;
  
  return {
    deprecated: isDeprecated(version),
    sunsetDate: v.sunsetDate,
    migrationGuide: v.migrationGuide,
  };
}

/**
 * Extract version from request
 * Priority: X-API-Version header > URL path > default
 */
export function extractVersion(request: Request, pathname: string): string {
  // Check header first
  const headerVersion = request.headers.get('X-API-Version');
  if (headerVersion && isValidVersion(headerVersion)) {
    return headerVersion;
  }
  
  // Check URL path
  const pathMatch = pathname.match(/\/api\/v(\d+)\//);
  if (pathMatch && isValidVersion(pathMatch[1])) {
    return pathMatch[1];
  }
  
  // Default to latest
  return DEFAULT_VERSION;
}

/**
 * Generate Sunset header value
 * Format: "Sat, 31 Dec 2026 23:59:59 GMT"
 */
export function formatSunsetHeader(date: string): string {
  const d = new Date(date);
  return d.toUTCString();
}

/**
 * Generate deprecation warning message
 */
export function getDeprecationWarning(version: string): string | null {
  const info = getDeprecationInfo(version);
  if (!info?.deprecated) return null;
  
  const v = API_VERSIONS[version];
  let warning = `API version ${version} is deprecated`;
  
  if (info.sunsetDate) {
    warning += ` and will be removed on ${info.sunsetDate}`;
  }
  
  if (info.migrationGuide) {
    warning += `. See ${info.migrationGuide} for migration guide`;
  }
  
  return warning;
}

/**
 * Version-specific headers to add to responses
 */
export function getVersionHeaders(version: string): Record<string, string> {
  const headers: Record<string, string> = {
    'X-API-Version': version,
    'X-API-Latest-Version': LATEST_VERSION,
  };
  
  const v = API_VERSIONS[version];
  if (v) {
    if (v.status === 'deprecated' && v.sunsetDate) {
      headers['Sunset'] = formatSunsetHeader(v.sunsetDate);
      headers['Deprecation'] = 'true';
    }
    
    if (v.migrationGuide) {
      headers['Link'] = `<${v.migrationGuide}>; rel="deprecation"; type="text/html"`;
    }
  }
  
  return headers;
}

/**
 * Log deprecated API usage
 */
export function logDeprecatedUsage(
  version: string,
  endpoint: string,
  userAgent?: string,
  ip?: string
): void {
  const warning = getDeprecationWarning(version);
  if (warning) {
    console.warn('[API Deprecation]', {
      version,
      endpoint,
      warning,
      userAgent,
      ip,
      timestamp: new Date().toISOString(),
    });
  }
}

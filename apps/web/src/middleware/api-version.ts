/**
 * API Version Middleware
 * Handles version extraction, deprecation warnings, and sunset enforcement
 */

import { defineMiddleware } from 'astro/middleware';
import {
  extractVersion,
  isDeprecated,
  isSunset,
  logDeprecatedUsage,
  getVersionHeaders,
  LATEST_VERSION,
} from '../lib/api-version';

export const apiVersionMiddleware = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  
  // Only apply to API routes
  if (!pathname.startsWith('/api/')) {
    return next();
  }
  
  // Skip admin version endpoints (they manage versions themselves)
  if (pathname.startsWith('/api/v1/admin/versions')) {
    return next();
  }
  
  // Extract version from request
  const version = extractVersion(context.request, pathname);
  
  // Attach version to locals for use in handlers
  context.locals.apiVersion = version;
  
  // Check if version is sunset (no longer supported)
  if (isSunset(version)) {
    const versionHeaders = getVersionHeaders(version);
    return new Response(JSON.stringify({
      success: false,
      error: {
        code: 'VERSION_SUNSET',
        message: `API version ${version} is no longer supported. Please migrate to version ${LATEST_VERSION}.`,
        currentVersion: LATEST_VERSION,
      },
    }), {
      status: 410, // Gone
      headers: {
        'Content-Type': 'application/json',
        ...versionHeaders,
      },
    });
  }
  
  // Log deprecated usage
  if (isDeprecated(version)) {
    const userAgent = context.request.headers.get('user-agent') || undefined;
    const ip = context.clientAddress;
    logDeprecatedUsage(version, pathname, userAgent, ip);
  }
  
  // Continue to handler
  const response = await next();
  
  // Add version headers to response
  const versionHeaders = getVersionHeaders(version);
  for (const [key, value] of Object.entries(versionHeaders)) {
    response.headers.set(key, value);
  }
  
  return response;
});

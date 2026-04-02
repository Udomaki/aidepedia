/**
 * API Key Authentication Middleware
 * 
 * Validates API keys from the Authorization header
 * Tracks usage and enforces rate limits
 */

import { defineMiddleware } from 'astro/middleware';
import {
  validateApiKey,
  logApiUsage,
  getApiKeyRateLimit,
  hasPermission,
  type ApiKey,
} from '../lib/api-keys';
import {
  checkRateLimit,
  getClientIP,
  createRateLimitHeaders,
  type RateLimitConfig,
} from '../lib/rate-limiter';

// API routes that support API key authentication
const API_KEY_ROUTES = [
  '/api/v1',
];

// Routes that require specific permissions
const PERMISSION_REQUIREMENTS: Record<string, { method: string; permission: string }> = {
  // Read operations
  'GET:/api/v1/articles': { method: 'GET', permission: 'read-only' },
  'GET:/api/v1/categories': { method: 'GET', permission: 'read-only' },
  'GET:/api/v1/search': { method: 'GET', permission: 'read-only' },
  
  // Write operations
  'POST:/api/v1/articles': { method: 'POST', permission: 'read-write' },
  'PUT:/api/v1/articles': { method: 'PUT', permission: 'read-write' },
  'PATCH:/api/v1/articles': { method: 'PATCH', permission: 'read-write' },
  
  // Admin operations
  'DELETE:/api/v1/articles': { method: 'DELETE', permission: 'admin' },
  'POST:/api/v1/admin': { method: 'POST', permission: 'admin' },
};

// In-memory store for API key rate limits
const apiKeyRateLimits = new Map<number, { count: number; resetTime: number; blocked: boolean }>();

/**
 * Check if route supports API key authentication
 */
function supportsApiKeyAuth(pathname: string): boolean {
  return API_KEY_ROUTES.some(route => pathname.startsWith(route));
}

/**
 * Extract API key from Authorization header
 */
function extractApiKey(request: Request): string | null {
  const authHeader = request.headers.get('Authorization');
  
  if (!authHeader) {
    return null;
  }
  
  // Support both "Bearer <token>" and "<token>" formats
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }
  
  // Direct token format
  return authHeader.trim();
}

/**
 * Check rate limit for API key
 */
async function checkApiKeyRateLimit(
  apiKey: ApiKey
): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
  const keyId = apiKey.id;
  const now = Date.now();
  const windowMs = 60 * 60 * 1000; // 1 hour
  const maxRequests = apiKey.rateLimit;
  
  // Get or create rate limit entry
  let entry = apiKeyRateLimits.get(keyId);
  
  if (!entry || entry.resetTime < now) {
    entry = {
      count: 0,
      resetTime: now + windowMs,
      blocked: false,
    };
  }
  
  // Increment count
  entry.count += 1;
  
  // Check if limit exceeded
  const allowed = entry.count <= maxRequests;
  const remaining = Math.max(0, maxRequests - entry.count);
  
  // Store entry
  apiKeyRateLimits.set(keyId, entry);
  
  return {
    allowed,
    remaining,
    resetTime: entry.resetTime,
  };
}

/**
 * Get required permission for route
 */
function getRequiredPermission(method: string, pathname: string): string | null {
  // Check exact match first
  const exactKey = `${method}:${pathname}`;
  if (PERMISSION_REQUIREMENTS[exactKey]) {
    return PERMISSION_REQUIREMENTS[exactKey].permission;
  }
  
  // Check prefix match
  for (const [key, req] of Object.entries(PERMISSION_REQUIREMENTS)) {
    const [reqMethod, path] = key.split(':');
    if (reqMethod === method && pathname.startsWith(path)) {
      return req.permission;
    }
  }
  
  // Default to read-only for GET, read-write for others
  if (method === 'GET') {
    return 'read-only';
  }
  return 'read-write';
}

/**
 * API Key Authentication Middleware
 */
export const apiKeyAuthMiddleware = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  const method = context.request.method;
  
  // Only apply to API routes that support API key auth
  if (!supportsApiKeyAuth(pathname)) {
    return next();
  }
  
  // Extract API key from header
  const apiKeyString = extractApiKey(context.request);
  
  // If no API key, continue (might use session auth instead)
  if (!apiKeyString) {
    return next();
  }
  
  // Validate API key
  const startTime = Date.now();
  const validation = await validateApiKey(apiKeyString);
  
  if (!validation.valid) {
    return new Response(
      JSON.stringify({
        error: 'Unauthorized',
        message: validation.error || 'Invalid API key',
      }),
      {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
  
  const apiKey = validation.key!;
  
  // Check permissions
  const requiredPermission = getRequiredPermission(method, pathname);
  if (requiredPermission && !hasPermission(apiKey.type, requiredPermission as any)) {
    return new Response(
      JSON.stringify({
        error: 'Forbidden',
        message: `This operation requires ${requiredPermission} permission`,
      }),
      {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
  
  // Check rate limit
  const rateLimitStatus = await checkApiKeyRateLimit(apiKey);
  
  if (!rateLimitStatus.allowed) {
    return new Response(
      JSON.stringify({
        error: 'Too Many Requests',
        message: 'API key rate limit exceeded',
        retryAfter: Math.ceil((rateLimitStatus.resetTime - Date.now()) / 1000),
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'X-RateLimit-Limit': apiKey.rateLimit.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': Math.ceil(rateLimitStatus.resetTime / 1000).toString(),
          'Retry-After': Math.ceil((rateLimitStatus.resetTime - Date.now()) / 1000).toString(),
        },
      }
    );
  }
  
  // Attach API key to context for use in endpoints
  context.locals.apiKey = apiKey;
  
  // Process request
  let response: Response;
  let statusCode = 200;
  let errorMessage: string | undefined;
  
  try {
    response = await next();
    statusCode = response.status;
  } catch (error) {
    statusCode = 500;
    errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw error;
  } finally {
    // Log usage asynchronously (don't await)
    const responseTime = Date.now() - startTime;
    logApiUsage(
      apiKey.id,
      pathname,
      method,
      statusCode,
      responseTime,
      {
        ipAddress: getClientIP(context.request),
        userAgent: context.request.headers.get('User-Agent') || undefined,
        errorMessage,
      }
    ).catch(err => {
      console.error('Failed to log API usage:', err);
    });
  }
  
  // Add rate limit headers to response
  const newResponse = new Response(response!.body, response!);
  newResponse.headers.set('X-RateLimit-Limit', apiKey.rateLimit.toString());
  newResponse.headers.set('X-RateLimit-Remaining', rateLimitStatus.remaining.toString());
  newResponse.headers.set('X-RateLimit-Reset', Math.ceil(rateLimitStatus.resetTime / 1000).toString());
  
  return newResponse;
});

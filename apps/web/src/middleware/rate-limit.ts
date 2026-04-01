import { defineMiddleware } from 'astro/middleware';
import { getSession } from 'auth-astro/server';
import {
  checkRateLimit,
  getClientIP,
  createRateLimitHeaders,
  DEFAULT_CONFIG,
  type RateLimitConfig,
} from '../lib/rate-limiter';

// Custom configuration (can be overridden via environment variables)
const rateLimitConfig: RateLimitConfig = {
  maxRequests: parseInt(import.meta.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  windowMs: parseInt(import.meta.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes default
  exemptRoutes: [
    '/api/auth',
    '/api/health',
    '/_astro',
    '/favicon.ico',
    '/sitemap.xml',
    '/robots.txt',
    '/login',
    '/signup',
  ],
  skipAdminUsers: true,
};

/**
 * Check if user is an admin
 */
async function isAdmin(request: Request): Promise<boolean> {
  try {
    const session = await getSession(request);
    if (!session?.user) return false;
    
    // Check if user has admin role
    const user = session.user as any;
    return user?.role === 'admin' || user?.tier === 'admin';
  } catch {
    return false;
  }
}

/**
 * Check if route should be exempt from rate limiting
 */
function isExemptRoute(pathname: string): boolean {
  // Check configured exempt routes
  if (rateLimitConfig.exemptRoutes?.some(route => pathname.startsWith(route))) {
    return true;
  }
  
  // Skip static assets
  if (
    pathname.startsWith('/_astro') ||
    pathname.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/)
  ) {
    return true;
  }
  
  // Only apply rate limiting to API routes
  if (!pathname.startsWith('/api/')) {
    return true;
  }
  
  return false;
}

/**
 * Rate limiting middleware
 */
export const rateLimitMiddleware = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  
  // Check if route is exempt
  if (isExemptRoute(pathname)) {
    return next();
  }
  
  // Get client IP
  const ip = getClientIP(context.request);
  
  // Check if user is admin (skip rate limiting for admins if configured)
  if (rateLimitConfig.skipAdminUsers) {
    const admin = await isAdmin(context.request);
    if (admin) {
      return next();
    }
  }
  
  // Check rate limit
  const status = checkRateLimit(ip, rateLimitConfig);
  
  // Add rate limit headers to all responses
  const response = await next();
  
  // Create rate limit headers
  const rateLimitHeaders = createRateLimitHeaders(status, rateLimitConfig);
  
  // Clone response and add headers
  const newResponse = new Response(response.body, response);
  rateLimitHeaders.forEach((value, key) => {
    newResponse.headers.set(key, value);
  });
  
  // If blocked, return 429
  if (status.blocked) {
    return new Response(
      JSON.stringify({
        error: 'Too Many Requests',
        message: 'Rate limit exceeded. Please try again later.',
        retryAfter: Math.ceil((status.resetTime - Date.now()) / 1000),
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          ...Object.fromEntries(rateLimitHeaders.entries()),
        },
      }
    );
  }
  
  return newResponse;
});

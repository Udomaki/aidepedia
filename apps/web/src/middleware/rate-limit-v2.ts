import { defineMiddleware } from 'astro/middleware';
import { getSession } from 'auth-astro/server';
import {
  getUserQuota,
  getIPQuota,
  incrementUserQuota,
  incrementIPQuota,
  type QuotaStatus,
} from '../lib/quota-tracker';

/**
 * Create rate limit headers from quota status
 */
function createRateLimitHeaders(status: QuotaStatus): Headers {
  const headers = new Headers();
  headers.set('X-RateLimit-Limit', status.hourlyLimit.toString());
  headers.set('X-RateLimit-Remaining', status.hourlyRemaining.toString());
  headers.set('X-RateLimit-Reset', Math.ceil(status.windowReset.getTime() / 1000).toString());
  
  // Add monthly quota headers
  headers.set('X-RateLimit-Monthly-Limit', status.monthlyLimit.toString());
  headers.set('X-RateLimit-Monthly-Remaining', status.monthlyRemaining.toString());
  headers.set('X-RateLimit-Monthly-Reset', Math.ceil(status.monthReset.getTime() / 1000).toString());
  
  return headers;
}

/**
 * Get client IP from request
 */
function getClientIP(request: Request): string {
  // Check Cloudflare headers first
  const cfIP = request.headers.get('CF-Connecting-IP');
  if (cfIP) return cfIP;
  
  // Check X-Forwarded-For header
  const forwardedFor = request.headers.get('X-Forwarded-For');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }
  
  // Check X-Real-IP header
  const realIP = request.headers.get('X-Real-IP');
  if (realIP) return realIP;
  
  // Fallback
  return 'unknown';
}

/**
 * Check if route should be exempt from rate limiting
 */
function isExemptRoute(pathname: string): boolean {
  const exemptRoutes = [
    '/api/auth',
    '/api/health',
    '/_astro',
    '/favicon.ico',
    '/sitemap.xml',
    '/robots.txt',
    '/login',
    '/signup',
  ];
  
  // Check configured exempt routes
  if (exemptRoutes.some(route => pathname.startsWith(route))) {
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
 * Rate limiting middleware with quota tracking
 */
export const rateLimitMiddleware = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  
  // Check if route is exempt
  if (isExemptRoute(pathname)) {
    return next();
  }
  
  try {
    // Get session to check if user is authenticated
    const session = await getSession(context.request);
    const userId = session?.user?.id ? parseInt(session.user.id) : null;
    
    // Get quota status
    let quotaStatus: QuotaStatus;
    
    if (userId) {
      quotaStatus = await getUserQuota(userId);
    } else {
      const ip = getClientIP(context.request);
      quotaStatus = await getIPQuota(ip);
    }
    
    // Check if quota exceeded
    const hourlyExceeded = quotaStatus.hourlyUsed >= quotaStatus.hourlyLimit;
    const monthlyExceeded = quotaStatus.monthlyUsed >= quotaStatus.monthlyLimit;
    
    if (hourlyExceeded || monthlyExceeded) {
      const headers = createRateLimitHeaders(quotaStatus);
      const retryAfter = Math.ceil((quotaStatus.windowReset.getTime() - Date.now()) / 1000);
      headers.set('Retry-After', retryAfter.toString());
      
      return new Response(
        JSON.stringify({
          error: 'Too Many Requests',
          message: monthlyExceeded 
            ? 'Monthly quota exceeded. Please upgrade your plan or wait for next month.'
            : 'Hourly rate limit exceeded. Please try again later.',
          retryAfter,
          tier: quotaStatus.tier,
          hourly: {
            used: quotaStatus.hourlyUsed,
            limit: quotaStatus.hourlyLimit,
            remaining: quotaStatus.hourlyRemaining,
          },
          monthly: {
            used: quotaStatus.monthlyUsed,
            limit: quotaStatus.monthlyLimit,
            remaining: quotaStatus.monthlyRemaining,
          },
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            ...Object.fromEntries(headers.entries()),
          },
        }
      );
    }
    
    // Process request
    const response = await next();
    
    // Increment quota after successful request
    if (userId) {
      await incrementUserQuota(userId);
    } else {
      const ip = getClientIP(context.request);
      await incrementIPQuota(ip);
    }
    
    // Add rate limit headers to response
    const newResponse = new Response(response.body, response);
    const rateLimitHeaders = createRateLimitHeaders(quotaStatus);
    rateLimitHeaders.forEach((value, key) => {
      newResponse.headers.set(key, value);
    });
    
    return newResponse;
  } catch (error) {
    // If quota tracking fails, fall back to allowing the request
    console.error('Quota tracking error:', error);
    return next();
  }
});

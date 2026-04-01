/**
 * IP-based Rate Limiter for API endpoints
 * 
 * Features:
 * - Configurable rate limits (default: 100 requests per 15 minutes)
 * - 429 response with Retry-After header
 * - Rate limit headers (X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset)
 * - Admin whitelist support
 * - Configurable exempt routes
 */

export interface RateLimitConfig {
  /** Maximum number of requests allowed in the window */
  maxRequests: number;
  /** Time window in milliseconds */
  windowMs: number;
  /** Routes to exempt from rate limiting */
  exemptRoutes?: string[];
  /** Whether to skip rate limiting for admin users */
  skipAdminUsers?: boolean;
}

export interface RateLimitEntry {
  count: number;
  resetTime: number;
  blocked: boolean;
  blockedAt?: number;
}

export interface RateLimitStatus {
  ip: string;
  count: number;
  remaining: number;
  resetTime: number;
  blocked: boolean;
  blockedAt?: number;
}

// Default configuration
const DEFAULT_CONFIG: RateLimitConfig = {
  maxRequests: 100,
  windowMs: 15 * 60 * 1000, // 15 minutes
  exemptRoutes: [
    '/api/auth',
    '/api/health',
    '/_astro',
    '/favicon.ico',
  ],
  skipAdminUsers: true,
};

// In-memory store for rate limit data
// Note: In production with multiple instances, this should use Redis or similar
const rateLimitStore = new Map<string, RateLimitEntry>();
const blockedIPs = new Map<string, number>();

/**
 * Get client IP from request
 */
export function getClientIP(request: Request): string {
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
  
  // Fallback (shouldn't happen in production behind proxy)
  return 'unknown';
}

/**
 * Check if a route is exempt from rate limiting
 */
function isExemptRoute(pathname: string, exemptRoutes: string[]): boolean {
  return exemptRoutes.some(route => pathname.startsWith(route));
}

/**
 * Get rate limit key for an IP
 */
function getRateLimitKey(ip: string): string {
  return `rate_limit:${ip}`;
}

/**
 * Clean up expired entries from the store
 */
function cleanupExpiredEntries(): void {
  const now = Date.now();
  
  // Clean rate limit store
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetTime < now) {
      rateLimitStore.delete(key);
    }
  }
  
  // Clean blocked IPs (unblock after 1 hour)
  for (const [ip, blockedAt] of blockedIPs.entries()) {
    if (blockedAt < now - 60 * 60 * 1000) {
      blockedIPs.delete(ip);
    }
  }
}

// Run cleanup every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(cleanupExpiredEntries, 5 * 60 * 1000);
}

/**
 * Check rate limit for an IP
 */
export function checkRateLimit(
  ip: string,
  config: RateLimitConfig = DEFAULT_CONFIG
): RateLimitStatus {
  const key = getRateLimitKey(ip);
  const now = Date.now();
  
  // Check if IP is blocked
  if (blockedIPs.has(ip)) {
    const entry = rateLimitStore.get(key) || {
      count: 0,
      resetTime: now + config.windowMs,
      blocked: true,
      blockedAt: blockedIPs.get(ip),
    };
    
    return {
      ip,
      count: entry.count,
      remaining: 0,
      resetTime: entry.resetTime,
      blocked: true,
      blockedAt: entry.blockedAt,
    };
  }
  
  // Get or create entry
  let entry = rateLimitStore.get(key);
  
  if (!entry || entry.resetTime < now) {
    // Create new entry
    entry = {
      count: 0,
      resetTime: now + config.windowMs,
      blocked: false,
    };
  }
  
  // Increment count
  entry.count += 1;
  
  // Check if limit exceeded
  if (entry.count > config.maxRequests) {
    entry.blocked = true;
    entry.blockedAt = now;
    blockedIPs.set(ip, now);
  }
  
  // Store entry
  rateLimitStore.set(key, entry);
  
  return {
    ip,
    count: entry.count,
    remaining: Math.max(0, config.maxRequests - entry.count),
    resetTime: entry.resetTime,
    blocked: entry.blocked,
    blockedAt: entry.blockedAt,
  };
}

/**
 * Get current rate limit status for an IP (without incrementing)
 */
export function getRateLimitStatus(
  ip: string,
  config: RateLimitConfig = DEFAULT_CONFIG
): RateLimitStatus {
  const key = getRateLimitKey(ip);
  const now = Date.now();
  const entry = rateLimitStore.get(key);
  
  if (!entry || entry.resetTime < now) {
    return {
      ip,
      count: 0,
      remaining: config.maxRequests,
      resetTime: now + config.windowMs,
      blocked: false,
    };
  }
  
  return {
    ip,
    count: entry.count,
    remaining: Math.max(0, config.maxRequests - entry.count),
    resetTime: entry.resetTime,
    blocked: entry.blocked,
    blockedAt: entry.blockedAt,
  };
}

/**
 * Get all blocked IPs
 */
export function getBlockedIPs(): Array<{ ip: string; blockedAt: number }> {
  return Array.from(blockedIPs.entries()).map(([ip, blockedAt]) => ({
    ip,
    blockedAt,
  }));
}

/**
 * Get all rate limit entries
 */
export function getAllRateLimitStatuses(
  config: RateLimitConfig = DEFAULT_CONFIG
): RateLimitStatus[] {
  const now = Date.now();
  const statuses: RateLimitStatus[] = [];
  
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetTime >= now) {
      const ip = key.replace('rate_limit:', '');
      statuses.push({
        ip,
        count: entry.count,
        remaining: Math.max(0, config.maxRequests - entry.count),
        resetTime: entry.resetTime,
        blocked: entry.blocked,
        blockedAt: entry.blockedAt,
      });
    }
  }
  
  return statuses;
}

/**
 * Unblock an IP
 */
export function unblockIP(ip: string): boolean {
  blockedIPs.delete(ip);
  const key = getRateLimitKey(ip);
  const entry = rateLimitStore.get(key);
  if (entry) {
    entry.blocked = false;
    entry.blockedAt = undefined;
    rateLimitStore.set(key, entry);
    return true;
  }
  return false;
}

/**
 * Reset rate limit for an IP
 */
export function resetRateLimit(ip: string): boolean {
  const key = getRateLimitKey(ip);
  blockedIPs.delete(ip);
  return rateLimitStore.delete(key);
}

/**
 * Create rate limit headers
 */
export function createRateLimitHeaders(
  status: RateLimitStatus,
  config: RateLimitConfig = DEFAULT_CONFIG
): Headers {
  const headers = new Headers();
  headers.set('X-RateLimit-Limit', config.maxRequests.toString());
  headers.set('X-RateLimit-Remaining', status.remaining.toString());
  headers.set('X-RateLimit-Reset', Math.ceil(status.resetTime / 1000).toString());
  
  if (status.blocked) {
    const retryAfter = Math.ceil((status.resetTime - Date.now()) / 1000);
    headers.set('Retry-After', retryAfter.toString());
  }
  
  return headers;
}

/**
 * Export configuration for use in middleware
 */
export { DEFAULT_CONFIG };

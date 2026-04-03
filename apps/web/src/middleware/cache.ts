import { defineMiddleware } from 'astro/middleware';

/**
 * Cache Middleware for CDN & Edge Caching
 * 
 * Implements cache control headers for different content types:
 * - Static assets (JS, CSS, images): Cache 1 year
 * - API routes: No cache (dynamic)
 * - Article pages: Cache 1 hour, stale-while-revalidate
 * - Search results: No cache
 */

interface CacheConfig {
  maxAge: number;
  staleWhileRevalidate?: number;
  public: boolean;
}

const CACHE_CONFIGS: Record<string, CacheConfig> = {
  // Static assets - cache for 1 year
  static: {
    maxAge: 31536000, // 1 year in seconds
    public: true,
  },
  // Article pages - cache for 1 hour with stale-while-revalidate
  article: {
    maxAge: 3600, // 1 hour in seconds
    staleWhileRevalidate: 86400, // 1 day in seconds
    public: true,
  },
  // API routes - no cache (dynamic)
  api: {
    maxAge: 0,
    public: false,
  },
  // Search results - no cache
  search: {
    maxAge: 0,
    public: false,
  },
  // Default - short cache
  default: {
    maxAge: 300, // 5 minutes
    public: true,
  },
};

/**
 * Determine content type based on pathname
 */
function getContentType(pathname: string): string {
  // Static assets
  if (pathname.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|webp|woff|woff2|ttf|eot)$/i)) {
    return 'static';
  }
  
  // Search results
  if (pathname.startsWith('/search') || pathname.startsWith('/api/v1/search')) {
    return 'search';
  }
  
  // API routes (except search which is handled above)
  if (pathname.startsWith('/api/')) {
    return 'api';
  }
  
  // Article pages (URLs like /articles/slug or just /slug)
  // Exclude special paths like /admin, /auth, etc.
  if (pathname.match(/^\/articles\/[^/]+$/) || 
      (pathname.split('/').length === 2 && 
       !pathname.match(/^\/(api|admin|auth|login|logout|settings|profile|search|categories|tags)/))) {
    return 'article';
  }
  
  return 'default';
}

/**
 * Build Cache-Control header value
 */
function buildCacheControlHeader(config: CacheConfig): string {
  const parts: string[] = [];
  
  if (config.public) {
    parts.push('public');
  } else {
    parts.push('private');
  }
  
  parts.push(`max-age=${config.maxAge}`);
  
  if (config.staleWhileRevalidate !== undefined) {
    parts.push(`stale-while-revalidate=${config.staleWhileRevalidate}`);
  }
  
  // Add must-revalidate for zero max-age
  if (config.maxAge === 0) {
    parts.push('must-revalidate');
  }
  
  return parts.join(', ');
}

/**
 * Add CDN-related headers
 */
function addCDNHeaders(response: Response, contentType: string): void {
  // Add X-Content-Type for debugging
  response.headers.set('X-Content-Type', contentType);
  
  // Add Surrogate-Key for cache tagging (Cloudflare)
  // This allows purging by tag
  if (contentType === 'article') {
    response.headers.set('X-Surrogate-Key', 'article');
  }
}

export const cacheMiddleware = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  
  // Skip cache middleware for non-GET requests
  if (context.request.method !== 'GET' && context.request.method !== 'HEAD') {
    return next();
  }
  
  // Process the request
  const response = await next();
  
  // Determine content type and cache configuration
  const contentType = getContentType(pathname);
  const cacheConfig = CACHE_CONFIGS[contentType];
  
  // Set Cache-Control header
  const cacheControl = buildCacheControlHeader(cacheConfig);
  response.headers.set('Cache-Control', cacheControl);
  
  // Add CDN-specific headers
  addCDNHeaders(response, contentType);
  
  // Add Vary header for proper cache key generation
  // This ensures caches respect Accept-Encoding, Authorization, etc.
  const existingVary = response.headers.get('Vary');
  const varyParts = new Set<string>(['Accept-Encoding', 'Accept']);
  
  if (existingVary) {
    existingVary.split(',').forEach(part => varyParts.add(part.trim()));
  }
  
  // For API routes, also vary on Authorization
  if (contentType === 'api') {
    varyParts.add('Authorization');
  }
  
  response.headers.set('Vary', Array.from(varyParts).join(', '));
  
  return response;
});

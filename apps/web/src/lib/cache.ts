/**
 * Cache Utilities for CDN & Edge Caching
 * 
 * Helper functions for cache invalidation and management
 */

interface CachePurgeResult {
  success: boolean;
  message: string;
}

/**
 * Purge cache for a single article by slug
 */
export async function purgeArticleCache(slug: string): Promise<CachePurgeResult> {
  try {
    const response = await fetch(`${getBaseUrl()}/api/v1/cache/purge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'url',
        value: `${getBaseUrl()}/articles/${slug}`,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to purge cache: ${response.statusText}`);
    }

    const result = await response.json();
    return {
      success: result.success,
      message: result.data?.message || 'Cache purged successfully',
    };
  } catch (error) {
    console.error('Error purging article cache:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to purge cache',
    };
  }
}

/**
 * Purge cache for multiple articles
 */
export async function purgeMultipleArticles(slugs: string[]): Promise<CachePurgeResult> {
  try {
    const urls = slugs.map(slug => `${getBaseUrl()}/articles/${slug}`);
    
    const response = await fetch(`${getBaseUrl()}/api/v1/cache/purge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        files: urls,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to purge cache: ${response.statusText}`);
    }

    const result = await response.json();
    return {
      success: result.success,
      message: result.data?.message || `Purged ${slugs.length} articles`,
    };
  } catch (error) {
    console.error('Error purging multiple article caches:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to purge cache',
    };
  }
}

/**
 * Purge all article-related caches
 */
export async function purgeAllArticles(): Promise<CachePurgeResult> {
  try {
    const response = await fetch(`${getBaseUrl()}/api/v1/cache/purge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'tag',
        value: 'article',
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to purge cache: ${response.statusText}`);
    }

    const result = await response.json();
    return {
      success: result.success,
      message: result.data?.message || 'All article caches purged',
    };
  } catch (error) {
    console.error('Error purging all article caches:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to purge cache',
    };
  }
}

/**
 * Purge cache by URL pattern
 */
export async function purgeByPattern(pattern: string): Promise<CachePurgeResult> {
  try {
    const response = await fetch(`${getBaseUrl()}/api/v1/cache/purge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'prefix',
        value: pattern,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to purge cache: ${response.statusText}`);
    }

    const result = await response.json();
    return {
      success: result.success,
      message: result.data?.message || 'Cache purged by pattern',
    };
  } catch (error) {
    console.error('Error purging cache by pattern:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to purge cache',
    };
  }
}

/**
 * Purge all cache (use with caution!)
 */
export async function purgeAll(): Promise<CachePurgeResult> {
  try {
    const response = await fetch(`${getBaseUrl()}/api/v1/cache/purge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'all',
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to purge cache: ${response.statusText}`);
    }

    const result = await response.json();
    return {
      success: result.success,
      message: result.data?.message || 'All cache purged',
    };
  } catch (error) {
    console.error('Error purging all cache:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to purge cache',
    };
  }
}

/**
 * Get base URL for cache API calls
 */
function getBaseUrl(): string {
  // In Cloudflare Workers, use the request URL
  // In development, use localhost
  if (typeof import.meta !== 'undefined' && import.meta.env.SITE) {
    return import.meta.env.SITE;
  }
  return 'http://localhost:4321';
}

/**
 * Webhook handler for automatic cache purging
 * 
 * Call this after content updates to automatically purge related caches
 */
export async function handleContentUpdateWebhook(event: {
  type: 'article.created' | 'article.updated' | 'article.deleted';
  slug: string;
}): Promise<void> {
  console.log(`Content update webhook received: ${event.type} for ${event.slug}`);

  switch (event.type) {
    case 'article.updated':
    case 'article.deleted':
      // Purge the specific article
      await purgeArticleCache(event.slug);
      // Also purge list pages that might show this article
      await purgeByPattern('/articles');
      break;
    
    case 'article.created':
      // Purge list pages to show the new article
      await purgeByPattern('/articles');
      break;
  }
}

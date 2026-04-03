import type { APIRoute } from 'astro';
import { 
  successResponse, 
  errorResponse, 
  handleCors 
} from '../../../../lib/api-utils';
import { getSession } from '../../../../lib/auth';

/**
 * Cloudflare Cache API Integration
 * 
 * This endpoint purges cache using Cloudflare's Cache API
 * Requires Cloudflare API token with Zone.Cache Purge permissions
 */

interface PurgeRequest {
  type: 'url' | 'tag' | 'host' | 'prefix';
  value: string;
}

/**
 * Get Cloudflare API credentials from environment
 */
function getCloudflareCredentials() {
  // These should be set as environment variables in Cloudflare Workers
  const zoneId = import.meta.env.CLOUDFLARE_ZONE_ID;
  const apiToken = import.meta.env.CLOUDFLARE_API_TOKEN;
  
  return { zoneId, apiToken };
}

/**
 * Purge cache by URL
 */
async function purgeByUrl(urls: string[]): Promise<{ success: boolean; message: string }> {
  const { zoneId, apiToken } = getCloudflareCredentials();
  
  if (!zoneId || !apiToken) {
    console.warn('Cloudflare credentials not configured, cache purge will be local only');
    return { success: true, message: 'Cache purge skipped (no credentials)' };
  }
  
  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ files: urls }),
      }
    );
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Cloudflare API error: ${JSON.stringify(error)}`);
    }
    
    return { success: true, message: `Purged ${urls.length} URL(s)` };
  } catch (error) {
    console.error('Failed to purge cache by URL:', error);
    throw error;
  }
}

/**
 * Purge cache by tag
 */
async function purgeByTag(tags: string[]): Promise<{ success: boolean; message: string }> {
  const { zoneId, apiToken } = getCloudflareCredentials();
  
  if (!zoneId || !apiToken) {
    console.warn('Cloudflare credentials not configured, cache purge will be local only');
    return { success: true, message: 'Cache purge skipped (no credentials)' };
  }
  
  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tags }),
      }
    );
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Cloudflare API error: ${JSON.stringify(error)}`);
    }
    
    return { success: true, message: `Purged ${tags.length} tag(s)` };
  } catch (error) {
    console.error('Failed to purge cache by tag:', error);
    throw error;
  }
}

/**
 * Purge cache by host
 */
async function purgeByHost(hosts: string[]): Promise<{ success: boolean; message: string }> {
  const { zoneId, apiToken } = getCloudflareCredentials();
  
  if (!zoneId || !apiToken) {
    console.warn('Cloudflare credentials not configured, cache purge will be local only');
    return { success: true, message: 'Cache purge skipped (no credentials)' };
  }
  
  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ hosts }),
      }
    );
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Cloudflare API error: ${JSON.stringify(error)}`);
    }
    
    return { success: true, message: `Purged ${hosts.length} host(s)` };
  } catch (error) {
    console.error('Failed to purge cache by host:', error);
    throw error;
  }
}

/**
 * Purge cache by prefix
 */
async function purgeByPrefix(prefixes: string[]): Promise<{ success: boolean; message: string }> {
  const { zoneId, apiToken } = getCloudflareCredentials();
  
  if (!zoneId || !apiToken) {
    console.warn('Cloudflare credentials not configured, cache purge will be local only');
    return { success: true, message: 'Cache purge skipped (no credentials)' };
  }
  
  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prefixes }),
      }
    );
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Cloudflare API error: ${JSON.stringify(error)}`);
    }
    
    return { success: true, message: `Purged ${prefixes.length} prefix(es)` };
  } catch (error) {
    console.error('Failed to purge cache by prefix:', error);
    throw error;
  }
}

/**
 * Purge everything (use with caution!)
 */
async function purgeAll(): Promise<{ success: boolean; message: string }> {
  const { zoneId, apiToken } = getCloudflareCredentials();
  
  if (!zoneId || !apiToken) {
    console.warn('Cloudflare credentials not configured, cache purge will be local only');
    return { success: true, message: 'Cache purge skipped (no credentials)' };
  }
  
  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ purge_everything: true }),
      }
    );
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Cloudflare API error: ${JSON.stringify(error)}`);
    }
    
    return { success: true, message: 'Purged all cache' };
  } catch (error) {
    console.error('Failed to purge all cache:', error);
    throw error;
  }
}

/**
 * POST /api/v1/cache/purge
 * Purge cache by various methods
 * 
 * Request body:
 * - type: 'url' | 'tag' | 'host' | 'prefix' | 'all'
 * - value: string (for single purges)
 * - files/tags/hosts/prefixes: string[] (for batch purges)
 * 
 * Requires authentication (admin only recommended)
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    // Check authentication
    const session = await getSession(request);
    if (!session?.user?.id) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    }

    // Parse request body
    const body = await request.json();
    
    let result;
    
    // Handle batch purges
    if (body.files && Array.isArray(body.files)) {
      result = await purgeByUrl(body.files);
    } else if (body.tags && Array.isArray(body.tags)) {
      result = await purgeByTag(body.tags);
    } else if (body.hosts && Array.isArray(body.hosts)) {
      result = await purgeByHost(body.hosts);
    } else if (body.prefixes && Array.isArray(body.prefixes)) {
      result = await purgeByPrefix(body.prefixes);
    } else if (body.type === 'all') {
      // Purge everything - use with caution!
      result = await purgeAll();
    } else if (body.type && body.value) {
      // Handle single purge
      const purgeRequest = body as PurgeRequest;
      
      switch (purgeRequest.type) {
        case 'url':
          result = await purgeByUrl([purgeRequest.value]);
          break;
        case 'tag':
          result = await purgeByTag([purgeRequest.value]);
          break;
        case 'host':
          result = await purgeByHost([purgeRequest.value]);
          break;
        case 'prefix':
          result = await purgeByPrefix([purgeRequest.value]);
          break;
        default:
          return errorResponse('VALIDATION_ERROR', 'Invalid purge type', 400);
      }
    } else {
      return errorResponse('VALIDATION_ERROR', 'Invalid request body', 400);
    }
    
    return successResponse({
      purged: true,
      ...result,
    });
  } catch (error) {
    console.error('Error purging cache:', error);
    
    if (error instanceof Error) {
      return errorResponse('INTERNAL_ERROR', error.message, 500);
    }
    
    return errorResponse('INTERNAL_ERROR', 'Failed to purge cache', 500);
  }
};

/**
 * Handle OPTIONS for CORS preflight
 */
export const OPTIONS: APIRoute = async () => {
  return handleCors();
};

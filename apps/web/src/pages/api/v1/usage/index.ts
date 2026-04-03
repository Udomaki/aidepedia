/**
 * API Usage Statistics API
 * OC-124: API Monetization - Usage tracking and reporting
 */

import type { APIRoute } from 'astro';
import { getSession } from '../../../../lib/auth';
import { getUserUsageStats, getApiKeyUsageStats } from '../../../../lib/api-usage-tracker';

/**
 * GET /api/v1/usage - Get usage statistics
 * Query params:
 *  - period: day | week | month (default: month)
 *  - apiKeyId: specific API key ID (optional)
 */
export const GET: APIRoute = async ({ request, url }) => {
  try {
    const session = await getSession(request);
    
    if (!session?.user?.id) {
      return new Response(JSON.stringify({ 
        error: 'Unauthorized' 
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const userId = parseInt(session.user.id);
    const period = (url.searchParams.get('period') || 'month') as 'day' | 'week' | 'month';
    const apiKeyId = url.searchParams.get('apiKeyId');
    
    if (!['day', 'week', 'month'].includes(period)) {
      return new Response(JSON.stringify({ 
        error: 'Invalid period. Must be day, week, or month' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    let stats;
    
    if (apiKeyId) {
      // Get stats for specific API key
      const keyId = parseInt(apiKeyId);
      if (isNaN(keyId)) {
        return new Response(JSON.stringify({ 
          error: 'Invalid API key ID' 
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      stats = await getApiKeyUsageStats(keyId, period);
    } else {
      // Get stats for all user's API keys
      stats = await getUserUsageStats(userId, period);
    }
    
    return new Response(JSON.stringify(stats), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error fetching usage stats:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to fetch usage statistics',
      message: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

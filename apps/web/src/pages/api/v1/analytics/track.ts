import type { APIRoute } from 'astro';
import { insertPageView } from '@aidepedia/db/queries';

interface TrackPayload {
  path: string;
  articleId?: number;
  referrer?: string;
  readTimeSeconds?: number;
  scrollDepth?: number;
}

/**
 * Simple SHA-256 hash function using Web Crypto API
 */
async function hashIP(ip: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(ip);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * POST /api/v1/analytics/track
 * Track a page view (privacy-focused, no cookies)
 */
export const POST: APIRoute = async ({ request, clientAddress }) => {
  try {
    const payload: TrackPayload = await request.json();
    
    // Validate required fields
    if (!payload.path) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Path is required' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Hash IP for privacy (SHA-256)
    const visitorHash = await hashIP(clientAddress || 'unknown');

    // Get country from Cloudflare header if available
    const countryCode = request.headers.get('CF-IPCountry') || null;
    
    // Truncate user agent for privacy
    const userAgent = request.headers.get('user-agent')?.substring(0, 500) || null;
    
    // Truncate referrer
    const referrer = payload.referrer?.substring(0, 500) || null;

    // Insert page view
    await insertPageView({
      visitorHash,
      path: payload.path,
      articleId: payload.articleId || null,
      referrer,
      userAgent,
      countryCode,
      readTimeSeconds: payload.readTimeSeconds || null,
      scrollDepth: payload.scrollDepth || null,
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      }
    });
  } catch (error) {
    console.error('Analytics tracking error:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: 'Failed to track page view' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

// Handle CORS preflight
export const OPTIONS: APIRoute = () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
};

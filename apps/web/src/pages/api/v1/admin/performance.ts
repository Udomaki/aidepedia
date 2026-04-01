import type { APIRoute } from 'astro';
import { getSession } from 'auth-astro/server';
import { 
  getSlowQueries, 
  getApiPerformanceMetrics, 
  getPerformanceSummary 
} from '../../../../lib/performance';

export const GET: APIRoute = async ({ request, url }) => {
  try {
    // Check authentication
    const session = await getSession(request);
    if (!session) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Check if user is admin
    const isAdmin = (session.user as any)?.role === 'admin' || 
                    (session.user as any)?.tier === 'admin';
    
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Forbidden - Admin access required' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get query parameters
    const type = url.searchParams.get('type') || 'summary';
    const hours = parseInt(url.searchParams.get('hours') || '24');
    const limit = parseInt(url.searchParams.get('limit') || '100');
    const minDuration = url.searchParams.get('minDuration') 
      ? parseInt(url.searchParams.get('minDuration')!) 
      : undefined;

    let data;

    switch (type) {
      case 'slow-queries':
        data = await getSlowQueries(limit, minDuration, hours);
        break;
      
      case 'api-metrics':
        data = await getApiPerformanceMetrics(hours);
        break;
      
      case 'summary':
      default:
        data = await getPerformanceSummary(hours);
        break;
    }

    return new Response(JSON.stringify({
      success: true,
      data,
      meta: {
        type,
        hours,
        limit,
        minDuration,
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error fetching performance data:', error);
    return new Response(JSON.stringify({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

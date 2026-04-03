import type { APIRoute } from 'astro';
import { getSession } from 'auth-astro/server';
import { handleRunJobs } from '../../../../../lib/recommendation-jobs';

/**
 * Admin endpoint to manually trigger recommendation jobs
 * Requires authentication and admin privileges
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    const session = await getSession(request);
    
    if (!session?.user?.id) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    // TODO: Check if user is admin
    // For now, any authenticated user can trigger jobs
    // In production, add proper admin check
    
    return await handleRunJobs();
  } catch (error) {
    console.error('Error running recommendation jobs:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to run recommendation jobs',
      message: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

/**
 * GET endpoint to check job status
 */
export const GET: APIRoute = async ({ request }) => {
  try {
    const session = await getSession(request);
    
    if (!session?.user?.id) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    // Return job status info
    return new Response(JSON.stringify({
      status: 'ready',
      message: 'Recommendation jobs are ready to run',
      endpoints: {
        trigger: 'POST /api/v1/admin/recommendations/jobs',
      },
      timestamp: new Date().toISOString(),
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error checking job status:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to check job status',
      message: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

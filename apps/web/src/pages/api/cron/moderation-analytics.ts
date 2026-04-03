import type { APIRoute } from 'astro';
import { aggregateDailyAnalytics } from '../../../lib/moderation-automation';

/**
 * Cron endpoint to aggregate daily moderation analytics
 * Should be called once per day via a cron service
 * 
 * Security: In production, add authentication via cron secret
 */

export const POST: APIRoute = async ({ request }) => {
  try {
    // Verify cron secret if configured
    const cronSecret = request.headers.get('X-Cron-Secret');
    if (process.env.CRON_SECRET && cronSecret !== process.env.CRON_SECRET) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Run analytics aggregation
    await aggregateDailyAnalytics();

    return new Response(JSON.stringify({ 
      success: true,
      message: 'Daily analytics aggregated successfully',
      timestamp: new Date().toISOString(),
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error running moderation analytics cron:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Failed to aggregate analytics',
      timestamp: new Date().toISOString(),
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

import type { APIRoute } from 'astro';
import { getModerationAnalytics, upsertModerationAnalytics } from '@aidepedia/db';

export const GET: APIRoute = async ({ url }) => {
  try {
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');

    if (!startDate || !endDate) {
      return new Response(JSON.stringify({ 
        error: 'Missing required parameters: startDate, endDate' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const analytics = await getModerationAnalytics(
      new Date(startDate),
      new Date(endDate)
    );

    // Aggregate the data
    const aggregated = {
      totalFlags: analytics.reduce((sum, day) => sum + (day.totalFlags || 0), 0),
      autoHiddenFlags: analytics.reduce((sum, day) => sum + (day.autoHiddenFlags || 0), 0),
      reviewedFlags: analytics.reduce((sum, day) => sum + (day.reviewedFlags || 0), 0),
      dismissedFlags: analytics.reduce((sum, day) => sum + (day.dismissedFlags || 0), 0),
      falsePositives: analytics.reduce((sum, day) => sum + (day.falsePositives || 0), 0),
      falseNegatives: analytics.reduce((sum, day) => sum + (day.falseNegatives || 0), 0),
      warnings: analytics.reduce((sum, day) => sum + (day.warnings || 0), 0),
      tempBans: analytics.reduce((sum, day) => sum + (day.tempBans || 0), 0),
      permabans: analytics.reduce((sum, day) => sum + (day.permabans || 0), 0),
      contentRemoved: analytics.reduce((sum, day) => sum + (day.contentRemoved || 0), 0),
      appealsSubmitted: analytics.reduce((sum, day) => sum + (day.appealsSubmitted || 0), 0),
      appealsApproved: analytics.reduce((sum, day) => sum + (day.appealsApproved || 0), 0),
      appealsRejected: analytics.reduce((sum, day) => sum + (day.appealsRejected || 0), 0),
      avgReviewTime: analytics.length > 0 
        ? analytics.reduce((sum, day) => sum + (day.avgReviewTime || 0), 0) / analytics.length 
        : 0,
      dailyData: analytics,
      categoryBreakdown: aggregateCategories(analytics.map(a => a.flagsByCategory).filter(Boolean)),
    };

    return new Response(JSON.stringify(aggregated), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error fetching moderation analytics:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Failed to fetch analytics' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

function aggregateCategories(categoryData: Array<Record<string, number> | null>): Record<string, number> {
  const aggregated: Record<string, number> = {};
  
  categoryData.forEach(data => {
    if (data) {
      Object.entries(data).forEach(([category, count]) => {
        aggregated[category] = (aggregated[category] || 0) + count;
      });
    }
  });
  
  return aggregated;
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const data = await request.json();
    const { date, ...analyticsData } = data;

    if (!date) {
      return new Response(JSON.stringify({ 
        error: 'Missing required field: date' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const analytics = await upsertModerationAnalytics(new Date(date), analyticsData);

    return new Response(JSON.stringify({ success: true, analytics }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error creating moderation analytics:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Failed to create analytics' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

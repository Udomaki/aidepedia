import type { APIRoute } from 'astro';
import { getSession } from '../../../../lib/auth';

// Simple in-memory export history (in production, use a database table)
// This will be reset on server restart, but serves as a basic implementation
const exportHistory = new Map<string, any[]>();

export const GET: APIRoute = async ({ request }) => {
  try {
    const session = await getSession(request);
    
    if (!session?.user?.id) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const userId = session.user.id;
    const history = exportHistory.get(userId) || [];

    // Filter out exports older than 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const recentHistory = history.filter(exp => 
      new Date(exp.exportedAt) > thirtyDaysAgo
    );

    // Update stored history
    exportHistory.set(userId, recentHistory);

    return new Response(JSON.stringify({ history: recentHistory }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Export history error:', error);
    return new Response(JSON.stringify({ error: 'Failed to retrieve export history' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const session = await getSession(request);
    
    if (!session?.user?.id) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await request.json();
    const { articleSlug, articleTitle, format, includeMetadata, includeImages } = body;

    const userId = session.user.id;
    const history = exportHistory.get(userId) || [];

    const exportRecord = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      articleSlug,
      articleTitle,
      format,
      includeMetadata,
      includeImages,
      exportedAt: new Date().toISOString(),
      downloadUrl: `/api/v1/articles/${articleSlug}/export?format=${format}&includeMetadata=${includeMetadata}&includeImages=${includeImages}`,
    };

    history.unshift(exportRecord); // Add to beginning

    // Keep only last 100 exports
    if (history.length > 100) {
      history.splice(100);
    }

    exportHistory.set(userId, history);

    return new Response(JSON.stringify({ success: true, record: exportRecord }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Export history record error:', error);
    return new Response(JSON.stringify({ error: 'Failed to record export' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

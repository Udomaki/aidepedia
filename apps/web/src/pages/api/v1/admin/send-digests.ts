import type { APIRoute } from 'astro';
import { getSession } from '../../../../lib/auth';
import { 
  getUsersForDigest,
  getDigestContent,
  queueEmail,
  markDigestSent,
  getUserById,
  NotFoundError
} from '@aidepedia/db';
import { 
  successResponse, 
  errorResponse, 
  handleCors 
} from '../../../../lib/api-utils';

/**
 * POST /api/v1/admin/send-digests
 * Trigger sending of email digests (admin only)
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    const session = await getSession(request);
    
    if (!session?.user?.id) {
      return errorResponse('UNAUTHORIZED', 'You must be logged in', 401);
    }

    // Check if user is admin (you may need to adjust this based on your auth system)
    const user = await getUserById(parseInt(session.user.id as string));
    
    // For now, allow any authenticated user to trigger digests
    // In production, you'd check for admin role here
    
    // Parse request body
    const body = await request.json();
    const { type = 'daily' } = body;

    if (type !== 'daily' && type !== 'weekly') {
      return errorResponse('VALIDATION_ERROR', 'type must be "daily" or "weekly"', 400);
    }

    // Get users who should receive digests
    const users = await getUsersForDigest(type);
    
    if (users.length === 0) {
      return successResponse({
        message: 'No users due for digests',
        sent: 0,
      });
    }

    // Queue emails for each user
    let sentCount = 0;
    const errors: Array<{ userId: number; error: string }> = [];

    for (const userInfo of users) {
      try {
        // Get digest content for this user
        const content = await getDigestContent(userInfo.userId, type);
        
        // Skip if no content
        if (
          content.newArticles.length === 0 &&
          content.followingActivity.length === 0 &&
          content.trendingArticles.length === 0
        ) {
          continue;
        }

        // Generate email HTML
        const emailHtml = generateDigestEmail(userInfo.name || 'User', type, content);
        
        // Queue the email
        await queueEmail({
          to: userInfo.email,
          subject: type === 'daily' 
            ? 'Your Daily AIdepedia Digest' 
            : 'Your Weekly AIdepedia Digest',
          body: emailHtml,
        });

        // Mark digest as sent
        await markDigestSent(userInfo.userId, type);
        
        sentCount++;
      } catch (error) {
        errors.push({
          userId: userInfo.userId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return successResponse({
      message: `Queued ${sentCount} digest emails`,
      sent: sentCount,
      total: users.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('Error sending digests:', error);
    
    if (error instanceof NotFoundError) {
      return errorResponse('NOT_FOUND', 'User not found', 404);
    }
    
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to send digests',
      500
    );
  }
};

/**
 * Generate HTML email for digest
 */
function generateDigestEmail(
  userName: string,
  type: 'daily' | 'weekly',
  content: {
    newArticles: any[];
    followingActivity: any[];
    trendingArticles: any[];
  }
): string {
  const period = type === 'daily' ? 'today' : 'this week';
  
  let html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    h1 { color: #2563eb; }
    h2 { color: #1e40af; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; margin-top: 30px; }
    .article { background: #f9fafb; padding: 16px; border-radius: 8px; margin-bottom: 12px; }
    .article-title { font-weight: 600; color: #1e40af; text-decoration: none; }
    .article-meta { color: #6b7280; font-size: 14px; margin-top: 4px; }
    .activity-item { padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 2px solid #e5e7eb; color: #6b7280; font-size: 14px; }
    .btn { display: inline-block; padding: 10px 20px; background: #2563eb; color: white; text-decoration: none; border-radius: 6px; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Hi ${userName},</h1>
    <p>Here's what happened on AIdepedia ${period}:</p>
  `;

  // New Articles Section
  if (content.newArticles.length > 0) {
    html += `<h2>📚 New Articles</h2>`;
    content.newArticles.slice(0, 5).forEach((article: any) => {
      html += `
      <div class="article">
        <a href="${process.env.SITE_URL || 'https://aidepedia.com'}/articles/${article.slug}" class="article-title">
          ${escapeHtml(article.title)}
        </a>
        ${article.excerpt ? `<p style="margin-top: 8px; color: #4b5563;">${escapeHtml(article.excerpt.substring(0, 150))}${article.excerpt.length > 150 ? '...' : ''}</p>` : ''}
      </div>
      `;
    });
  }

  // Following Activity Section
  if (content.followingActivity.length > 0) {
    html += `<h2>👥 Activity from People You Follow</h2>`;
    content.followingActivity.slice(0, 10).forEach((activity: any) => {
      html += `
      <div class="activity-item">
        <strong>Edit:</strong> 
        <a href="${process.env.SITE_URL || 'https://aidepedia.com'}/articles/${articleSlugFromTitle(activity.articleTitle)}" class="article-title">
          ${escapeHtml(activity.articleTitle)}
        </a>
        <span class="article-meta">${formatTimestamp(activity.timestamp)}</span>
      </div>
      `;
    });
  }

  // Trending Articles Section
  if (content.trendingArticles.length > 0) {
    html += `<h2>🔥 Trending Articles</h2>`;
    content.trendingArticles.slice(0, 5).forEach((article: any) => {
      html += `
      <div class="article">
        <a href="${process.env.SITE_URL || 'https://aidepedia.com'}/articles/${article.slug}" class="article-title">
          ${escapeHtml(article.title)}
        </a>
        <div class="article-meta">${article.viewCount || 0} views</div>
      </div>
      `;
    });
  }

  // Footer
  html += `
    <div class="footer">
      <p>You're receiving this email because you enabled ${type} digests on AIdepedia.</p>
      <p>
        <a href="${process.env.SITE_URL || 'https://aidepedia.com'}/settings/notifications">Manage notification settings</a>
      </p>
    </div>
  </div>
</body>
</html>
  `;

  return html;
}

/**
 * Escape HTML entities
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

/**
 * Convert article title to slug (simplified)
 */
function articleSlugFromTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/**
 * Format timestamp to relative time
 */
function formatTimestamp(timestamp: Date): string {
  const now = new Date();
  const diff = now.getTime() - new Date(timestamp).getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  return 'just now';
}

/**
 * Handle OPTIONS for CORS preflight
 */
export const OPTIONS: APIRoute = async () => {
  return handleCors();
};

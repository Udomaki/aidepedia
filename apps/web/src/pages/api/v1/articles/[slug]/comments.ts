import type { APIRoute } from 'astro';
import { 
  getArticleBySlug, 
  getCommentsByArticle, 
  createComment,
  getUserByUsername,
  createMentionNotifications,
} from '@aidepedia/db';
import { getSession } from 'auth-astro/server';
import { parseMentions, extractUniqueUsernames } from '../../../../../lib/mentions';

export const prerender = false;

/**
 * GET /api/v1/articles/[slug]/comments
 * Get all comments for an article as a threaded tree
 */
export const GET: APIRoute = async ({ params }) => {
  try {
    const { slug } = params;

    if (!slug) {
      return new Response(JSON.stringify({ error: 'Slug is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get article to get its ID
    const article = await getArticleBySlug(slug);
    
    // Get comments as threaded tree
    const comments = await getCommentsByArticle(article.id);

    return new Response(JSON.stringify({ comments }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Get comments error:', error);
    
    if (error.name === 'NotFoundError') {
      return new Response(JSON.stringify({ error: 'Article not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(
      JSON.stringify({ error: error.message || 'Failed to get comments' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};

/**
 * POST /api/v1/articles/[slug]/comments
 * Create a new comment (requires authentication)
 */
export const POST: APIRoute = async ({ request, params }) => {
  try {
    const { slug } = params;

    if (!slug) {
      return new Response(JSON.stringify({ error: 'Slug is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Check authentication
    const session = await getSession(request);
    
    if (!session?.user?.id) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get article to get its ID
    const article = await getArticleBySlug(slug);

    // Parse request body
    const body = await request.json();
    const { parentId, content } = body;

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return new Response(JSON.stringify({ error: 'Content is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Create comment
    const comment = await createComment({
      articleId: article.id,
      userId: parseInt(session.user.id),
      parentId: parentId ? parseInt(parentId) : null,
      content: content.trim(),
    });

    // Handle @mentions in comment content
    const mentions = parseMentions(content);
    const uniqueUsernames = extractUniqueUsernames(mentions);
    
    if (uniqueUsernames.length > 0) {
      // Resolve usernames to user IDs
      const commenterId = parseInt(session.user.id);
      const userPromises = uniqueUsernames.map(async (username) => {
        try {
          const user = await getUserByUsername(username);
          return user;
        } catch (error) {
          // User not found, skip
          return null;
        }
      });
      const users = await Promise.all(userPromises);
      
      // Filter out non-existent users and the commenter themselves
      const mentionedUserIds = users
        .filter(user => user !== null && user.id !== commenterId)
        .map(user => user!.id);
      
      if (mentionedUserIds.length > 0) {
        // Create mention notifications
        await createMentionNotifications(mentionedUserIds, {
          title: `You were mentioned in a comment on "${article.title}"`,
          content: `You were mentioned in a comment: "${content.trim().substring(0, 100)}..."`,
          mentionedByUserId: commenterId,
          articleId: article.id,
          articleSlug: article.slug,
          commentId: comment.id,
        });
      }
    }

    return new Response(JSON.stringify({ comment }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Create comment error:', error);
    
    if (error.name === 'NotFoundError') {
      return new Response(JSON.stringify({ error: 'Article not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(
      JSON.stringify({ error: error.message || 'Failed to create comment' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};

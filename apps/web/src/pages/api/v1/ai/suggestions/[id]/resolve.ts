import type { APIRoute } from 'astro';
import { getSession } from 'auth-astro/server';
import { db, ai_suggestions, articles, eq, and } from '@aidepedia/db';

export const POST: APIRoute = async ({ request, params }) => {
  try {
    const session = await getSession(request);
    if (!session?.user?.id) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const suggestionId = parseInt(params.id || '0');
    const { action } = await request.json();

    if (!suggestionId || !action) {
      return new Response(
        JSON.stringify({ error: 'Suggestion ID and action are required' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    if (!['accept', 'reject', 'dismiss'].includes(action)) {
      return new Response(JSON.stringify({ error: 'Invalid action' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Fetch suggestion
    const suggestion = await db.query.ai_suggestions.findFirst({
      where: eq(ai_suggestions.id, suggestionId),
    });

    if (!suggestion) {
      return new Response(JSON.stringify({ error: 'Suggestion not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Update suggestion status
    await db
      .update(ai_suggestions)
      .set({
        status: action === 'accept' ? 'accepted' : action === 'reject' ? 'rejected' : 'dismissed',
        resolvedAt: new Date(),
      })
      .where(eq(ai_suggestions.id, suggestionId));

    // If accepted and has text replacement, update the article
    if (action === 'accept' && suggestion.originalText && suggestion.suggestedText) {
      const article = await db.query.articles.findFirst({
        where: eq(articles.id, suggestion.articleId!),
      });

      if (article) {
        const updatedContent = article.content.replace(
          suggestion.originalText,
          suggestion.suggestedText
        );

        await db
          .update(articles)
          .set({
            content: updatedContent,
            updatedAt: new Date(),
          })
          .where(eq(articles.id, suggestion.articleId!));
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        status: action === 'accept' ? 'accepted' : action === 'reject' ? 'rejected' : 'dismissed',
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Resolve suggestion error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Failed to resolve suggestion',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};

import type { APIRoute } from 'astro';
import { submitEditorialVote, getEditorArticleVote, getArticleEditorialVotes } from '@aidepedia/db';

export const prerender = false;

export const POST: APIRoute = async ({ request, params }) => {
  try {
    const articleId = parseInt(params.id!);
    if (isNaN(articleId)) {
      return new Response(JSON.stringify({ error: 'Invalid article ID' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await request.json();
    const { editorId, vote, qualityRating, comment } = body;

    if (!editorId || !vote || !['approve', 'reject', 'neutral'].includes(vote)) {
      return new Response(JSON.stringify({ error: 'Invalid request body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const result = await submitEditorialVote(articleId, editorId, vote, qualityRating, comment);

    // Get updated vote summary
    const summary = await getArticleEditorialVotes(articleId);

    return new Response(JSON.stringify({ ...result, summary }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Editorial vote error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to submit vote' }),
      {
        status: error.name === 'NotFoundError' ? 404 : 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};

export const GET: APIRoute = async ({ params, url }) => {
  try {
    const articleId = parseInt(params.id!);
    const editorId = url.searchParams.get('editorId');
    const summary = url.searchParams.get('summary') === 'true';

    if (isNaN(articleId)) {
      return new Response(JSON.stringify({ error: 'Invalid article ID' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (summary) {
      // Return vote summary for all votes
      const votes = await getArticleEditorialVotes(articleId);
      return new Response(JSON.stringify(votes), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!editorId) {
      return new Response(JSON.stringify({ error: 'Editor ID required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Return specific editor's vote
    const vote = await getEditorArticleVote(articleId, parseInt(editorId));

    return new Response(JSON.stringify({ vote }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Get editorial vote error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to get vote' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};

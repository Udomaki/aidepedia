import type { APIRoute } from 'astro';
import { voteOnRevision, getRevisionUserVote } from '@aidepedia/db';

export const prerender = false;

export const POST: APIRoute = async ({ request, params }) => {
  try {
    const revisionId = parseInt(params.id!);
    if (isNaN(revisionId)) {
      return new Response(JSON.stringify({ error: 'Invalid revision ID' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await request.json();
    const { editorId, voteType } = body;

    if (!editorId || !voteType || !['upvote', 'downvote'].includes(voteType)) {
      return new Response(JSON.stringify({ error: 'Invalid request body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const result = await voteOnRevision(revisionId, editorId, voteType);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Vote error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to vote' }),
      {
        status: error.name === 'NotFoundError' ? 404 : 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};

export const GET: APIRoute = async ({ params, url }) => {
  try {
    const revisionId = parseInt(params.id!);
    const editorId = url.searchParams.get('editorId');

    if (isNaN(revisionId) || !editorId) {
      return new Response(JSON.stringify({ error: 'Invalid parameters' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const vote = await getRevisionUserVote(revisionId, parseInt(editorId));

    return new Response(JSON.stringify({ vote }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Get vote error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to get vote' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};

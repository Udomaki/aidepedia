import type { APIRoute } from 'astro';
import { analyzeAppeal, calculateAppealMetrics } from '../../../lib/moderation';
import { createContentAppeal, getContentAppeals, updateContentAppeal } from '@aidepedia/db';

export const POST: APIRoute = async ({ request }) => {
  try {
    const data = await request.json();
    const { contentType, contentId, userId, reason, originalContent } = data;

    if (!contentType || !contentId || !userId || !reason || !originalContent) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Create appeal
    const appeal = await createContentAppeal({
      contentType,
      contentId,
      userId,
      reason,
      originalContent,
    });

    // Analyze appeal with AI
    const analysis = await analyzeAppeal({
      id: appeal.id.toString(),
      contentId: contentId.toString(),
      contentType,
      userId: userId.toString(),
      reason,
      originalContent,
      status: 'pending',
      createdAt: new Date(),
    });

    // Update appeal with AI suggestion
    await updateContentAppeal(appeal.id, {
      aiSuggestion: analysis.suggestion,
      aiConfidence: Math.round(analysis.confidence * 100),
      aiReasoning: analysis.reasoning,
    });

    return new Response(JSON.stringify({
      appeal: {
        ...appeal,
        aiSuggestion: analysis.suggestion,
        aiConfidence: analysis.confidence,
        aiReasoning: analysis.reasoning,
      },
      analysis,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Appeal creation error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Failed to create appeal' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const GET: APIRoute = async ({ url }) => {
  try {
    const status = url.searchParams.get('status') as 'pending' | 'approved' | 'rejected' | null;
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '20');

    const result = await getContentAppeals({
      status: status || undefined,
      page,
      limit,
    });

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Appeals fetch error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Failed to fetch appeals' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const PUT: APIRoute = async ({ request }) => {
  try {
    const data = await request.json();
    const { id, status, reviewedBy } = data;

    if (!id || !status || !reviewedBy) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const result = await updateContentAppeal(id, {
      status,
      reviewedBy,
    });

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Appeal update error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Failed to update appeal' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

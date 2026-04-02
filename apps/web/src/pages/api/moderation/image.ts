import type { APIRoute } from 'astro';
import { analyzeImage } from '../../../lib/moderation';
import { addImageToModerationQueue, updateImageModeration } from '@aidepedia/db';

export const POST: APIRoute = async ({ request }) => {
  try {
    const data = await request.json();
    const { imageUrl, relatedContentType, relatedContentId, uploadedBy } = data;

    if (!imageUrl) {
      return new Response(JSON.stringify({ error: 'Image URL is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Add to moderation queue
    const queueItem = await addImageToModerationQueue({
      imageUrl,
      relatedContentType,
      relatedContentId,
      uploadedBy,
    });

    // Analyze image
    const result = await analyzeImage(imageUrl);

    // Update moderation queue with results
    await updateImageModeration(queueItem.id, {
      approved: result.approved ? true : (result.flagged ? false : null),
      flagged: result.flagged,
      confidence: Math.round(result.confidence * 100),
      categories: result.categories,
      categoryScores: result.categoryScores,
      reason: result.reason,
      suggestedAction: result.suggestedAction,
    });

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Image moderation error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Failed to moderate image' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const PUT: APIRoute = async ({ request }) => {
  try {
    const data = await request.json();
    const { id, approved, reviewedBy } = data;

    if (!id || approved === undefined) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const result = await updateImageModeration(id, {
      approved,
      reviewedBy,
    });

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Image moderation update error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Failed to update image moderation' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

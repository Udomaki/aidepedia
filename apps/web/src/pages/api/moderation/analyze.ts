import type { APIRoute } from 'astro';
import { analyzeContent, analyzeSentiment } from '../../../lib/moderation';
import { createModerationFlag, createSentimentAnalysis } from '@aidepedia/db';

export const POST: APIRoute = async ({ request }) => {
  try {
    const data = await request.json();
    const { content, contentType, contentId } = data;

    if (!content || !contentType || !contentId) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Analyze content for moderation
    const moderationResult = await analyzeContent(content);
    
    // Analyze sentiment
    const sentimentResult = await analyzeSentiment(content);

    // Create moderation flag if content is flagged
    if (moderationResult.flagged) {
      const flagType = getPrimaryFlagType(moderationResult.categories);
      await createModerationFlag({
        contentType,
        contentId,
        flagType,
        severity: moderationResult.severity,
        confidence: Math.round(moderationResult.confidence * 100),
        aiFlagged: true,
        categoryScores: moderationResult.categoryScores,
      });
    }

    // Create sentiment analysis record
    await createSentimentAnalysis({
      contentType,
      contentId,
      score: Math.round(sentimentResult.score * 100),
      magnitude: Math.round(sentimentResult.magnitude * 100),
      label: sentimentResult.label,
      flagged: sentimentResult.flagged,
      confidence: Math.round(sentimentResult.confidence * 100),
      keywords: sentimentResult.keywords,
    });

    return new Response(JSON.stringify({
      moderation: moderationResult,
      sentiment: sentimentResult,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Content analysis error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Failed to analyze content' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

function getPrimaryFlagType(categories: Record<string, boolean>): string {
  if (categories.violence || categories.violenceGraphic) return 'violence';
  if (categories.sexual || categories.sexualMinors) return 'sexual';
  if (categories.hate || categories.hateThreatening) return 'hate_speech';
  if (categories.harassment || categories.harassmentThreatening) return 'harassment';
  return 'inappropriate';
}

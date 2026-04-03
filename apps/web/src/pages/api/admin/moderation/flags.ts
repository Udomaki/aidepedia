import type { APIRoute } from 'astro';
import { getModerationFlags, updateModerationFlag, createModerationAction, updateUserReputation, getOrCreateUserReputation } from '@aidepedia/db';

export const GET: APIRoute = async ({ url }) => {
  try {
    const status = url.searchParams.get('status') || undefined;
    const category = url.searchParams.get('category') || undefined;
    const contentType = url.searchParams.get('contentType') || undefined;
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '20');

    const result = await getModerationFlags({
      status,
      category,
      contentType,
      page,
      limit,
    });

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error fetching moderation flags:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Failed to fetch flags' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const PATCH: APIRoute = async ({ request }) => {
  try {
    const data = await request.json();
    const { flagId, status, moderatorDecision, moderatorNotes, isFalsePositive, moderatorId } = data;

    if (!flagId) {
      return new Response(JSON.stringify({ 
        error: 'Missing required field: flagId' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Update the flag
    const flag = await updateModerationFlag(flagId, {
      status,
      moderatorDecision,
      moderatorNotes,
      isFalsePositive,
      reviewedBy: moderatorId,
    });

    // If this was marked as a false positive, update analytics
    if (isFalsePositive) {
      // Track false positive for analytics (could trigger webhook or update stats)
      console.log(`False positive detected for flag ${flagId}`);
    }

    // If moderator made a decision, create appropriate action
    if (moderatorDecision && flag) {
      if (moderatorDecision === 'reject') {
        await createModerationAction({
          actionType: 'content_removed',
          targetType: flag.contentType,
          targetContentId: flag.contentId,
          reason: moderatorNotes || 'Content removed by moderator',
          relatedFlagId: flagId,
          moderatorId,
        });
      } else if (moderatorDecision === 'approve') {
        await createModerationAction({
          actionType: 'content_restored',
          targetType: flag.contentType,
          targetContentId: flag.contentId,
          reason: moderatorNotes || 'Content approved by moderator',
          relatedFlagId: flagId,
          moderatorId,
        });
      }
    }

    return new Response(JSON.stringify({ success: true, flag }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error updating moderation flag:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Failed to update flag' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

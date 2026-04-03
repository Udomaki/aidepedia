import type { APIRoute } from 'astro';
import { analyzeContent, getPrimaryCategory, generateReasoning } from '../../../../lib/moderation-service';
import { createModerationFlag, getOrCreateUserReputation, getActiveModerationRules, createModerationAction, updateUserReputation, incrementRuleTriggerCount } from '@aidepedia/db';

export const POST: APIRoute = async ({ request }) => {
  try {
    const data = await request.json();
    const { contentType, contentId, text, authorId } = data;

    if (!contentType || !contentId || !text) {
      return new Response(JSON.stringify({ 
        error: 'Missing required fields: contentType, contentId, text' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Analyze content
    const moderationResult = await analyzeContent({
      text,
      contentType,
      contentId,
      authorId,
    });

    // If content is flagged, create a flag record
    if (moderationResult.flagged) {
      const primaryCategory = getPrimaryCategory(moderationResult);
      const reasoning = generateReasoning(moderationResult);

      // Get user reputation if authorId provided
      let userReputation = null;
      if (authorId) {
        userReputation = await getOrCreateUserReputation(authorId);
      }

      // Check automation rules
      const rules = await getActiveModerationRules();
      let autoAction = null;

      for (const rule of rules) {
        if (
          rule.category === primaryCategory &&
          moderationResult.confidence >= rule.minConfidence &&
          (!rule.minUserReputation || (userReputation && userReputation.score >= rule.minUserReputation)) &&
          (!rule.maxUserReputation || (userReputation && userReputation.score <= rule.maxUserReputation))
        ) {
          // Rule matches - take automated action
          autoAction = rule.action;
          
          if (autoAction === 'auto_hide') {
            // Create flag with auto_hidden status
            const flag = await createModerationFlag({
              contentType,
              contentId,
              category: primaryCategory,
              confidenceScore: moderationResult.confidence,
              aiReasoning: reasoning,
              status: 'auto_hidden',
            });

            // Create moderation action
            await createModerationAction({
              actionType: 'content_removed',
              targetType: contentType,
              targetContentId: contentId,
              targetUserId: authorId,
              reason: `Auto-hidden: ${reasoning}`,
              relatedFlagId: flag.id,
              isAutomated: true,
              automationRule: rule.name,
            });

            // Update user reputation
            if (authorId) {
              await updateUserReputation(authorId, {
                totalFlags: (userReputation?.totalFlags || 0) + 1,
                lastFlagAt: new Date(),
              });
            }
          } else if (autoAction === 'warn') {
            // Create pending flag and send warning
            const flag = await createModerationFlag({
              contentType,
              contentId,
              category: primaryCategory,
              confidenceScore: moderationResult.confidence,
              aiReasoning: reasoning,
              status: 'pending',
            });

            // Create warning action
            await createModerationAction({
              actionType: 'warn',
              targetType: 'user',
              targetUserId: authorId,
              reason: `Content flagged: ${reasoning}`,
              relatedFlagId: flag.id,
              isAutomated: true,
              automationRule: rule.name,
            });

            // Update user reputation
            if (authorId) {
              await updateUserReputation(authorId, {
                warnings: (userReputation?.warnings || 0) + 1,
                totalFlags: (userReputation?.totalFlags || 0) + 1,
                lastFlagAt: new Date(),
                lastActionAt: new Date(),
              });
            }
          } else if (autoAction === 'temp_ban') {
            // Create flag and temp ban user
            const flag = await createModerationFlag({
              contentType,
              contentId,
              category: primaryCategory,
              confidenceScore: moderationResult.confidence,
              aiReasoning: reasoning,
              status: 'auto_hidden',
            });

            // Create temp ban action
            await createModerationAction({
              actionType: 'temp_ban',
              targetType: 'user',
              targetUserId: authorId,
              targetContentId: contentId,
              reason: `Auto temp ban: ${reasoning}`,
              relatedFlagId: flag.id,
              duration: rule.actionDuration || 24, // Default 24 hours
              isAutomated: true,
              automationRule: rule.name,
            });

            // Update user reputation
            if (authorId) {
              await updateUserReputation(authorId, {
                tempBans: (userReputation?.tempBans || 0) + 1,
                totalFlags: (userReputation?.totalFlags || 0) + 1,
                lastFlagAt: new Date(),
                lastActionAt: new Date(),
              });
            }
          }

          // Increment rule trigger count
          await incrementRuleTriggerCount(rule.id);
          break; // Only apply first matching rule
        }
      }

      // If no auto action, create pending flag
      if (!autoAction) {
        await createModerationFlag({
          contentType,
          contentId,
          category: primaryCategory,
          confidenceScore: moderationResult.confidence,
          aiReasoning: reasoning,
          status: 'pending',
        });

        // Update user reputation
        if (authorId) {
          await updateUserReputation(authorId, {
            totalFlags: (userReputation?.totalFlags || 0) + 1,
            lastFlagAt: new Date(),
          });
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      flagged: moderationResult.flagged,
      confidence: moderationResult.confidence,
      categories: moderationResult.categories,
      categoryScores: moderationResult.categoryScores,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error scanning content:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Failed to scan content' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

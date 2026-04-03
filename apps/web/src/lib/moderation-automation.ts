/**
 * Moderation Automation Engine
 * Runs automated actions based on moderation rules
 */

import { getActiveModerationRules, getModerationFlags, updateModerationFlag, createModerationAction, updateUserReputation, getOrCreateUserReputation, incrementRuleTriggerCount } from '@aidepedia/db';

interface AutomationContext {
  flagId: number;
  contentType: 'article' | 'comment' | 'user_profile';
  contentId: number;
  category: string;
  confidenceScore: number;
  authorId?: number;
}

/**
 * Process automated actions for a moderation flag
 */
export async function processAutomatedActions(context: AutomationContext): Promise<void> {
  try {
    // Get user reputation if authorId provided
    let userReputation = null;
    if (context.authorId) {
      userReputation = await getOrCreateUserReputation(context.authorId);
    }

    // Get active rules sorted by priority
    const rules = await getActiveModerationRules();

    // Find matching rule
    for (const rule of rules) {
      if (
        rule.category === context.category &&
        context.confidenceScore >= rule.minConfidence &&
        (!rule.minUserReputation || (userReputation && userReputation.score >= rule.minUserReputation)) &&
        (!rule.maxUserReputation || (userReputation && userReputation.score <= rule.maxUserReputation))
      ) {
        // Rule matches - execute action
        await executeRuleAction(rule, context, userReputation);
        
        // Increment trigger count
        await incrementRuleTriggerCount(rule.id);
        
        // Only apply first matching rule
        break;
      }
    }
  } catch (error) {
    console.error('Error processing automated actions:', error);
    throw error;
  }
}

/**
 * Execute the action specified by a rule
 */
async function executeRuleAction(
  rule: any,
  context: AutomationContext,
  userReputation: any
): Promise<void> {
  switch (rule.action) {
    case 'auto_hide':
      await handleAutoHide(rule, context, userReputation);
      break;
    case 'auto_approve':
      await handleAutoApprove(rule, context);
      break;
    case 'warn':
      await handleWarn(rule, context, userReputation);
      break;
    case 'temp_ban':
      await handleTempBan(rule, context, userReputation);
      break;
    case 'flag_for_review':
      await handleFlagForReview(rule, context);
      break;
    default:
      console.warn(`Unknown action type: ${rule.action}`);
  }
}

async function handleAutoHide(rule: any, context: AutomationContext, userReputation: any): Promise<void> {
  // Update flag status
  await updateModerationFlag(context.flagId, {
    status: 'auto_hidden',
  });

  // Create moderation action
  await createModerationAction({
    actionType: 'content_removed',
    targetType: context.contentType,
    targetContentId: context.contentId,
    targetUserId: context.authorId,
    reason: `Auto-hidden by rule: ${rule.name}`,
    relatedFlagId: context.flagId,
    isAutomated: true,
    automationRule: rule.name,
  });

  // Update user reputation
  if (context.authorId) {
    await updateUserReputation(context.authorId, {
      totalFlags: (userReputation?.totalFlags || 0) + 1,
      lastFlagAt: new Date(),
    });
  }
}

async function handleAutoApprove(rule: any, context: AutomationContext): Promise<void> {
  // Update flag status
  await updateModerationFlag(context.flagId, {
    status: 'dismissed',
    moderatorDecision: 'approve',
  });

  // Create moderation action
  await createModerationAction({
    actionType: 'content_restored',
    targetType: context.contentType,
    targetContentId: context.contentId,
    targetUserId: context.authorId,
    reason: `Auto-approved by rule: ${rule.name}`,
    relatedFlagId: context.flagId,
    isAutomated: true,
    automationRule: rule.name,
  });
}

async function handleWarn(rule: any, context: AutomationContext, userReputation: any): Promise<void> {
  // Create warning action
  await createModerationAction({
    actionType: 'warn',
    targetType: 'user',
    targetUserId: context.authorId,
    targetContentId: context.contentId,
    reason: `Content flagged by rule: ${rule.name}`,
    relatedFlagId: context.flagId,
    isAutomated: true,
    automationRule: rule.name,
  });

  // Update user reputation
  if (context.authorId) {
    await updateUserReputation(context.authorId, {
      warnings: (userReputation?.warnings || 0) + 1,
      totalFlags: (userReputation?.totalFlags || 0) + 1,
      lastFlagAt: new Date(),
      lastActionAt: new Date(),
    });
  }
}

async function handleTempBan(rule: any, context: AutomationContext, userReputation: any): Promise<void> {
  // Update flag status
  await updateModerationFlag(context.flagId, {
    status: 'auto_hidden',
  });

  // Create temp ban action
  await createModerationAction({
    actionType: 'temp_ban',
    targetType: 'user',
    targetUserId: context.authorId,
    targetContentId: context.contentId,
    reason: `Auto temp ban by rule: ${rule.name}`,
    relatedFlagId: context.flagId,
    duration: rule.actionDuration || 24, // Default 24 hours
    isAutomated: true,
    automationRule: rule.name,
  });

  // Update user reputation
  if (context.authorId) {
    await updateUserReputation(context.authorId, {
      tempBans: (userReputation?.tempBans || 0) + 1,
      totalFlags: (userReputation?.totalFlags || 0) + 1,
      lastFlagAt: new Date(),
      lastActionAt: new Date(),
      isRateLimited: true,
      rateLimitExpires: new Date(Date.now() + (rule.actionDuration || 24) * 60 * 60 * 1000),
    });
  }
}

async function handleFlagForReview(rule: any, context: AutomationContext): Promise<void> {
  // Flag is already created, just ensure it's in pending status
  await updateModerationFlag(context.flagId, {
    status: 'pending',
  });
}

/**
 * Daily analytics aggregation job
 * Should be run once per day via cron
 */
export async function aggregateDailyAnalytics(): Promise<void> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  try {
    // Get today's flags
    const flags = await getModerationFlags({
      page: 1,
      limit: 1000,
    });

    // Filter to today's flags
    const todayFlags = flags.data.filter((flag: any) => {
      const flagDate = new Date(flag.createdAt);
      flagDate.setHours(0, 0, 0, 0);
      return flagDate.getTime() === today.getTime();
    });

    // Calculate metrics
    const totalFlags = todayFlags.length;
    const autoHiddenFlags = todayFlags.filter((f: any) => f.status === 'auto_hidden').length;
    const reviewedFlags = todayFlags.filter((f: any) => f.status === 'reviewed').length;
    const dismissedFlags = todayFlags.filter((f: any) => f.status === 'dismissed').length;
    const falsePositives = todayFlags.filter((f: any) => f.isFalsePositive).length;

    // Aggregate by category
    const flagsByCategory: Record<string, number> = {};
    todayFlags.forEach((flag: any) => {
      flagsByCategory[flag.category] = (flagsByCategory[flag.category] || 0) + 1;
    });

    // Get today's actions
    // TODO: Query moderation_actions for today

    // Upsert analytics
    const { upsertModerationAnalytics } = await import('@aidepedia/db');
    await upsertModerationAnalytics(today, {
      totalFlags,
      autoHiddenFlags,
      reviewedFlags,
      dismissedFlags,
      flagsByCategory,
      falsePositives,
      // TODO: Add other metrics
    });

    console.log(`Aggregated analytics for ${today.toISOString().split('T')[0]}`);
  } catch (error) {
    console.error('Error aggregating daily analytics:', error);
    throw error;
  }
}

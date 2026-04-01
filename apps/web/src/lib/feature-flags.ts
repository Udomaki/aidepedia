import { db } from '@aidepedia/db';
import { feature_flags } from '@aidepedia/db/schema';
import { eq, and } from '@aidepedia/db';
import { createHash } from 'crypto';

/**
 * Feature flag configuration
 */
export interface FeatureFlag {
  id: number;
  name: string;
  description: string | null;
  enabled: boolean;
  rolloutPercentage: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Cache for feature flags (simple in-memory cache)
 * In production, you might want to use Redis or similar
 */
const flagCache = new Map<string, { flag: FeatureFlag; timestamp: number }>();
const CACHE_TTL = 60 * 1000; // 1 minute

/**
 * Get a feature flag by name
 */
export async function getFeatureFlag(name: string): Promise<FeatureFlag | null> {
  try {
    // Check cache first
    const cached = flagCache.get(name);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.flag;
    }

    // Fetch from database
    const [flag] = await db
      .select()
      .from(feature_flags)
      .where(eq(feature_flags.name, name))
      .limit(1);

    if (!flag) {
      return null;
    }

    // Update cache
    flagCache.set(name, { flag: flag as FeatureFlag, timestamp: Date.now() });

    return flag as FeatureFlag;
  } catch (error) {
    console.error(`Failed to get feature flag ${name}:`, error);
    return null;
  }
}

/**
 * Check if a feature flag is enabled for a specific user
 * Uses percentage-based rollout with consistent hashing
 */
export async function isFeatureEnabled(
  flagName: string,
  userId?: number | string
): Promise<boolean> {
  const flag = await getFeatureFlag(flagName);
  
  // If flag doesn't exist or is globally disabled, return false
  if (!flag || !flag.enabled) {
    return false;
  }

  // If rollout is 100%, everyone gets it
  if (flag.rolloutPercentage >= 100) {
    return true;
  }

  // If rollout is 0%, no one gets it
  if (flag.rolloutPercentage <= 0) {
    return false;
  }

  // If no user ID provided, use rollout percentage as probability
  if (!userId) {
    return Math.random() * 100 < flag.rolloutPercentage;
  }

  // Use consistent hashing based on user ID and flag name
  // This ensures the same user always gets the same result for a given flag
  const hash = createHash('sha256')
    .update(`${flagName}:${userId}`)
    .digest('hex');
  
  // Convert first 8 characters of hash to a number between 0-100
  const hashNumber = parseInt(hash.substring(0, 8), 16);
  const userPercentage = (hashNumber % 10000) / 100; // 0.00 to 99.99

  return userPercentage < flag.rolloutPercentage;
}

/**
 * Check if a feature flag is enabled (sync version for cached flags)
 * Falls back to checking cache only, returns false if not cached
 */
export function isFeatureEnabledSync(flagName: string, userId?: number | string): boolean {
  const cached = flagCache.get(flagName);
  if (!cached || Date.now() - cached.timestamp >= CACHE_TTL) {
    return false;
  }

  const flag = cached.flag;
  
  if (!flag.enabled) {
    return false;
  }

  if (flag.rolloutPercentage >= 100) {
    return true;
  }

  if (flag.rolloutPercentage <= 0) {
    return false;
  }

  if (!userId) {
    return Math.random() * 100 < flag.rolloutPercentage;
  }

  const hash = createHash('sha256')
    .update(`${flagName}:${userId}`)
    .digest('hex');
  
  const hashNumber = parseInt(hash.substring(0, 8), 16);
  const userPercentage = (hashNumber % 10000) / 100;

  return userPercentage < flag.rolloutPercentage;
}

/**
 * Get all feature flags
 */
export async function getAllFeatureFlags(): Promise<FeatureFlag[]> {
  try {
    const flags = await db
      .select()
      .from(feature_flags)
      .orderBy(feature_flags.name);

    return flags as FeatureFlag[];
  } catch (error) {
    console.error('Failed to get all feature flags:', error);
    return [];
  }
}

/**
 * Clear the feature flag cache
 */
export function clearFeatureFlagCache(flagName?: string): void {
  if (flagName) {
    flagCache.delete(flagName);
  } else {
    flagCache.clear();
  }
}

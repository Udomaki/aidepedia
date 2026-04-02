/**
 * API Key Management Service
 * 
 * Features:
 * - Generate unique API keys
 * - Key hashing for secure storage
 * - Key validation
 * - Key revocation
 * - Usage tracking
 */

import { randomBytes, createHash } from 'crypto';
import { db, api_keys, api_usage, api_usage_hourly, eq, and, gte, lt, sql } from '@aidepedia/db';

export type ApiKeyType = 'read-only' | 'read-write' | 'admin';

export interface CreateApiKeyOptions {
  userId: number;
  name: string;
  type?: ApiKeyType;
  rateLimit?: number;
  expiresAt?: Date;
}

export interface ApiKey {
  id: number;
  userId: number;
  keyPrefix: string;
  name: string;
  type: ApiKeyType;
  rateLimit: number;
  isActive: boolean;
  totalRequests: number;
  createdAt: Date;
  lastUsedAt?: Date;
  expiresAt?: Date;
  revokedAt?: Date;
}

export interface ApiKeyWithSecret extends ApiKey {
  key: string; // Only available during creation
}

export interface ValidateKeyResult {
  valid: boolean;
  key?: ApiKey;
  error?: string;
}

export interface UsageStats {
  totalRequests: number;
  successRequests: number;
  errorRequests: number;
  avgResponseTime: number | null;
  topEndpoints: Array<{ endpoint: string; count: number }>;
}

/**
 * Generate a secure random API key
 */
export function generateApiKey(): string {
  // Generate 32 bytes of random data
  const buffer = randomBytes(32);
  // Convert to base64url (URL-safe base64)
  const key = buffer.toString('base64url');
  // Add prefix for identification
  return `ap_${key}`;
}

/**
 * Hash an API key for storage
 */
export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/**
 * Get key prefix (first 8 characters after prefix)
 */
export function getKeyPrefix(key: string): string {
  // Remove 'ap_' prefix and get first 8 chars
  const cleanKey = key.replace(/^ap_/, '');
  return cleanKey.substring(0, 8);
}

/**
 * Create a new API key
 */
export async function createApiKey(options: CreateApiKeyOptions): Promise<ApiKeyWithSecret> {
  // Generate the key
  const key = generateApiKey();
  const keyHash = hashApiKey(key);
  const keyPrefix = getKeyPrefix(key);
  
  // Insert into database
  const [apiKey] = await db
    .insert(api_keys)
    .values({
      userId: options.userId,
      keyHash,
      keyPrefix,
      name: options.name,
      type: options.type || 'read-only',
      rateLimit: options.rateLimit || 1000,
      expiresAt: options.expiresAt,
      isActive: true,
      totalRequests: 0,
    })
    .returning();
  
  return {
    ...apiKey,
    key, // Include the full key only during creation
  };
}

/**
 * Validate an API key
 */
export async function validateApiKey(key: string): Promise<ValidateKeyResult> {
  // Check format
  if (!key.startsWith('ap_')) {
    return { valid: false, error: 'Invalid API key format' };
  }
  
  // Hash the key
  const keyHash = hashApiKey(key);
  
  // Look up the key
  const [apiKey] = await db
    .select()
    .from(api_keys)
    .where(eq(api_keys.keyHash, keyHash))
    .limit(1);
  
  // Check if key exists
  if (!apiKey) {
    return { valid: false, error: 'API key not found' };
  }
  
  // Check if key is active
  if (!apiKey.isActive) {
    return { valid: false, error: 'API key is inactive' };
  }
  
  // Check if key is revoked
  if (apiKey.revokedAt) {
    return { valid: false, error: 'API key has been revoked' };
  }
  
  // Check if key is expired
  if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
    return { valid: false, error: 'API key has expired' };
  }
  
  // Update last used timestamp
  await db
    .update(api_keys)
    .set({ lastUsedAt: new Date() })
    .where(eq(api_keys.id, apiKey.id));
  
  return {
    valid: true,
    key: apiKey,
  };
}

/**
 * Get API keys for a user
 */
export async function getUserApiKeys(userId: number): Promise<ApiKey[]> {
  return await db
    .select()
    .from(api_keys)
    .where(eq(api_keys.userId, userId))
    .orderBy(api_keys.createdAt);
}

/**
 * Get a specific API key by ID
 */
export async function getApiKeyById(keyId: number, userId: number): Promise<ApiKey | null> {
  const [apiKey] = await db
    .select()
    .from(api_keys)
    .where(and(eq(api_keys.id, keyId), eq(api_keys.userId, userId)))
    .limit(1);
  
  return apiKey || null;
}

/**
 * Revoke an API key
 */
export async function revokeApiKey(keyId: number, userId: number, revokedBy?: number): Promise<boolean> {
  const result = await db
    .update(api_keys)
    .set({
      isActive: false,
      revokedAt: new Date(),
      revokedBy: revokedBy || userId,
    })
    .where(and(eq(api_keys.id, keyId), eq(api_keys.userId, userId)));
  
  return result.rowCount > 0;
}

/**
 * Update API key
 */
export async function updateApiKey(
  keyId: number,
  userId: number,
  updates: Partial<Pick<ApiKey, 'name' | 'type' | 'rateLimit'>>
): Promise<ApiKey | null> {
  const [apiKey] = await db
    .update(api_keys)
    .set({
      ...updates,
      updatedAt: new Date(),
    })
    .where(and(eq(api_keys.id, keyId), eq(api_keys.userId, userId)))
    .returning();
  
  return apiKey || null;
}

/**
 * Log API usage
 */
export async function logApiUsage(
  apiKeyId: number,
  endpoint: string,
  method: string,
  statusCode: number,
  responseTime: number,
  metadata?: {
    ipAddress?: string;
    userAgent?: string;
    errorMessage?: string;
  }
): Promise<void> {
  // Insert usage record
  await db.insert(api_usage).values({
    apiKeyId,
    endpoint,
    method,
    statusCode,
    responseTime,
    ipAddress: metadata?.ipAddress,
    userAgent: metadata?.userAgent,
    errorMessage: metadata?.errorMessage,
  });
  
  // Increment total requests counter on the key
  await db
    .update(api_keys)
    .set({
      totalRequests: sql`${api_keys.totalRequests} + 1`,
    })
    .where(eq(api_keys.id, apiKeyId));
}

/**
 * Get usage stats for an API key
 */
export async function getApiKeyUsageStats(
  apiKeyId: number,
  startDate: Date,
  endDate: Date
): Promise<UsageStats> {
  // Get aggregated stats
  const [stats] = await db
    .select({
      totalRequests: sql<number>`count(*)::int`,
      successRequests: sql<number>`count(*) filter (where ${api_usage.statusCode} >= 200 and ${api_usage.statusCode} < 300)::int`,
      errorRequests: sql<number>`count(*) filter (where ${api_usage.statusCode} >= 400)::int`,
      avgResponseTime: sql<number | null>`avg(${api_usage.responseTime})::int`,
    })
    .from(api_usage)
    .where(
      and(
        eq(api_usage.apiKeyId, apiKeyId),
        gte(api_usage.createdAt, startDate),
        lt(api_usage.createdAt, endDate)
      )
    );
  
  // Get top endpoints
  const topEndpoints = await db
    .select({
      endpoint: api_usage.endpoint,
      count: sql<number>`count(*)::int`,
    })
    .from(api_usage)
    .where(
      and(
        eq(api_usage.apiKeyId, apiKeyId),
        gte(api_usage.createdAt, startDate),
        lt(api_usage.createdAt, endDate)
      )
    )
    .groupBy(api_usage.endpoint)
    .orderBy(sql`count(*) desc`)
    .limit(10);
  
  return {
    totalRequests: stats?.totalRequests || 0,
    successRequests: stats?.successRequests || 0,
    errorRequests: stats?.errorRequests || 0,
    avgResponseTime: stats?.avgResponseTime || null,
    topEndpoints,
  };
}

/**
 * Check if API key has required permission
 */
export function hasPermission(keyType: ApiKeyType, requiredPermission: ApiKeyType): boolean {
  const permissions: Record<ApiKeyType, number> = {
    'read-only': 1,
    'read-write': 2,
    'admin': 3,
  };
  
  return permissions[keyType] >= permissions[requiredPermission];
}

/**
 * Get rate limit for an API key
 */
export async function getApiKeyRateLimit(keyId: number): Promise<number> {
  const [apiKey] = await db
    .select({ rateLimit: api_keys.rateLimit })
    .from(api_keys)
    .where(eq(api_keys.id, keyId))
    .limit(1);
  
  return apiKey?.rateLimit || 1000;
}

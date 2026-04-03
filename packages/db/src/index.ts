import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index';

const connectionString = process.env.DATABASE_URL!;

// Configure postgres for Cloudflare Workers compatibility
// Use WebSocket connection which works in edge environments
const client = postgres(connectionString, {
  // Disable prepare for edge environments
  prepare: false,
  // Use WebSocket transport for Cloudflare Workers
  // The postgres.js package automatically detects Cloudflare environment
});

export const db = drizzle(client, { schema });

export * from './schema/index';
export * from './queries';
export * from './types';
export * from './webhooks';
export * from './backup';
export * from './reading-time';

// Re-export drizzle-orm operators for convenience
export { eq, desc, and, or, like, inArray, sql, count, gte, lte, between, avg, not } from 'drizzle-orm';

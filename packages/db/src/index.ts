import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres/cjs';  // Cloudflare Workers compatible CommonJS export
import * as schema from './schema/index';

const connectionString = process.env.DATABASE_URL!;

const client = postgres(connectionString);

export const db = drizzle(client, { schema });

export * from './schema/index';
export * from './queries';
export * from './types';
export * from './webhooks';
// export * from './backup';  // Disabled for Cloudflare Workers - uses Node.js fs/child_process
export * from './reading-time';

// Re-export drizzle-orm operators for convenience
export { eq, desc, and, or, like, inArray, sql, count, gte, lte, between, avg } from 'drizzle-orm';

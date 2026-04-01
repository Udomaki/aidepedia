import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index';

const connectionString = process.env.DATABASE_URL!;

const client = postgres(connectionString);

export const db = drizzle(client, { schema });

export * from './schema/index';
export * from './queries';
export * from './types';
export * from './webhooks';

// Re-export drizzle-orm operators for convenience
export { eq, desc, and, or, like, inArray, sql, count, gte, lte, between } from 'drizzle-orm';

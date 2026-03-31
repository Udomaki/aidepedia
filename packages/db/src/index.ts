import { connect } from '@planetscale/database';
import { drizzle } from 'drizzle-orm/planetscale-serverless';
import * as schema from './schema/index';

const connection = connect({
  url: process.env.DATABASE_URL!,
});

export const db = drizzle(connection, { schema });

export * from './schema/index';

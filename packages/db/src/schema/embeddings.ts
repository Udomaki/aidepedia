import { pgTable, serial, integer, timestamp, vector, index } from 'drizzle-orm/pg-core';
import { articles } from './index';

/**
 * Article embeddings table for semantic search
 * Uses pgvector extension for vector similarity search
 */
export const article_embeddings = pgTable('article_embeddings', {
  id: serial('id').primaryKey(),
  articleId: integer('article_id').notNull().references(() => articles.id, { onDelete: 'cascade' }).unique(),
  
  // OpenAI embedding vector (1536 dimensions for text-embedding-3-small)
  embedding: vector('embedding', { dimensions: 1536 }).notNull(),
  
  // Metadata about the embedding
  model: varchar('model', { length: 100 }).notNull().default('text-embedding-3-small'),
  tokensUsed: integer('tokens_used'),
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  articleIdx: index('embedding_article_idx').on(table.articleId),
  // Vector index for similarity search (using HNSW)
  embeddingIdx: index('embedding_vector_idx').using('hnsw', table.embedding.op('vector_cosine_ops')),
}));

// Import varchar for model field
import { varchar } from 'drizzle-orm/pg-core';

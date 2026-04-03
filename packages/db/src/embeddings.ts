import { db } from './index';
import { articles, article_embeddings } from './schema/index';
import { eq, isNull, sql, inArray } from 'drizzle-orm';

/**
 * Embedding service for generating and managing article embeddings
 * Uses OpenAI's text-embedding-3-small model
 */

interface OpenAIEmbeddingResponse {
  object: string;
  data: Array<{
    object: string;
    embedding: number[];
    index: number;
  }>;
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

/**
 * Generate embedding for text using OpenAI API
 */
export async function generateEmbedding(text: string): Promise<{ embedding: number[]; tokens: number }> {
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is not set');
  }

  // Truncate text if too long (OpenAI has a token limit)
  const maxChars = 8000; // Conservative limit for text-embedding-3-small
  const truncatedText = text.length > maxChars ? text.substring(0, maxChars) : text;

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: truncatedText,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${error}`);
  }

  const data: OpenAIEmbeddingResponse = await response.json();
  
  return {
    embedding: data.data[0].embedding,
    tokens: data.usage.total_tokens,
  };
}

/**
 * Generate and store embedding for an article
 */
export async function generateArticleEmbedding(articleId: number): Promise<void> {
  // Fetch article
  const [article] = await db
    .select()
    .from(articles)
    .where(eq(articles.id, articleId))
    .limit(1);

  if (!article) {
    throw new Error(`Article ${articleId} not found`);
  }

  // Combine title, excerpt, and content for embedding
  const text = [
    article.title,
    article.excerpt || '',
    article.content,
    ...(article.tags || []),
  ].filter(Boolean).join('\n\n');

  // Generate embedding
  const { embedding, tokens } = await generateEmbedding(text);

  // Upsert embedding (drizzle expects array, not string)
  await db
    .insert(article_embeddings)
    .values({
      articleId,
      embedding: embedding, // Pass as array, not string
      model: 'text-embedding-3-small',
      tokensUsed: tokens,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: article_embeddings.articleId,
      set: {
        embedding: embedding, // Pass as array
        model: 'text-embedding-3-small',
        tokensUsed: tokens,
        updatedAt: new Date(),
      },
    });
}

/**
 * Batch generate embeddings for multiple articles
 */
export async function batchGenerateEmbeddings(articleIds?: number[]): Promise<{
  processed: number;
  failed: number;
  errors: string[];
}> {
  let query = db
    .select({ id: articles.id })
    .from(articles)
    .where(eq(articles.status, 'published'));

  // Filter by specific IDs if provided
  if (articleIds && articleIds.length > 0) {
    const articles_to_process = await db
      .select({ id: articles.id })
      .from(articles)
      .where(sql`${articles.id} IN ${articleIds} AND ${articles.status} = 'published'`);
    
    const results = {
      processed: 0,
      failed: 0,
      errors: [] as string[],
    };

    for (const article of articles_to_process) {
      try {
        await generateArticleEmbedding(article.id);
        results.processed++;
        
        // Rate limiting: wait 100ms between requests
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        results.failed++;
        results.errors.push(`Article ${article.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return results;
  }

  const articles_to_process = await query;

  const results = {
    processed: 0,
    failed: 0,
    errors: [] as string[],
  };

  for (const article of articles_to_process) {
    try {
      await generateArticleEmbedding(article.id);
      results.processed++;
      
      // Rate limiting: wait 100ms between requests
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      results.failed++;
      results.errors.push(`Article ${article.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  return results;
}

/**
 * Semantic search using vector similarity
 */
export async function semanticSearch(
  query: string,
  options: {
    limit?: number;
    offset?: number;
    threshold?: number;
  } = {}
): Promise<Array<{
  articleId: number;
  similarity: number;
  title: string;
  slug: string;
  excerpt: string | null;
}>> {
  const { limit = 20, offset = 0, threshold = 0.7 } = options;

  // Generate embedding for query
  const { embedding } = await generateEmbedding(query);
  const embeddingStr = `[${embedding.join(',')}]`;

  // Perform vector similarity search using cosine distance
  const results = await db.execute(sql`
    SELECT 
      a.id as article_id,
      a.title,
      a.slug,
      a.excerpt,
      1 - (e.embedding <=> ${embeddingStr}::vector) as similarity
    FROM ${articles} a
    INNER JOIN ${article_embeddings} e ON a.id = e.article_id
    WHERE a.status = 'published'
      AND 1 - (e.embedding <=> ${embeddingStr}::vector) > ${threshold}
    ORDER BY e.embedding <=> ${embeddingStr}::vector
    LIMIT ${limit}
    OFFSET ${offset}
  `) as any[];

  return results.map((row: any) => ({
    articleId: row.article_id,
    title: row.title,
    slug: row.slug,
    excerpt: row.excerpt,
    similarity: parseFloat(row.similarity),
  }));
}

/**
 * Hybrid search combining semantic and keyword search
 */
export async function hybridSearch(
  query: string,
  options: {
    limit?: number;
    offset?: number;
    semanticWeight?: number;
    keywordWeight?: number;
    categoryId?: number;
  } = {}
): Promise<Array<{
  articleId: number;
  title: string;
  slug: string;
  excerpt: string | null;
  semanticScore: number;
  keywordScore: number;
  combinedScore: number;
}>> {
  const {
    limit = 20,
    offset = 0,
    semanticWeight = 0.7,
    keywordWeight = 0.3,
    categoryId,
  } = options;

  // Generate embedding for query
  const { embedding } = await generateEmbedding(query);
  const embeddingStr = `[${embedding.join(',')}]`;

  // Perform hybrid search using weighted combination
  const categoryFilter = categoryId 
    ? sql`AND a.category_id = ${categoryId}` 
    : sql``;

  const results = await db.execute(sql`
    WITH semantic_results AS (
      SELECT 
        a.id as article_id,
        a.title,
        a.slug,
        a.excerpt,
        1 - (e.embedding <=> ${embeddingStr}::vector) as semantic_score,
        0 as keyword_score
      FROM ${articles} a
      INNER JOIN ${article_embeddings} e ON a.id = e.article_id
      WHERE a.status = 'published'
        ${categoryFilter}
    ),
    keyword_results AS (
      SELECT 
        id as article_id,
        title,
        slug,
        excerpt,
        0 as semantic_score,
        CASE 
          WHEN title ILIKE ${`%${query}%`} THEN 1.0
          WHEN excerpt ILIKE ${`%${query}%`} THEN 0.7
          WHEN content ILIKE ${`%${query}%`} THEN 0.5
          ELSE 0
        END as keyword_score
      FROM ${articles}
      WHERE status = 'published'
        ${categoryFilter}
        AND (
          title ILIKE ${`%${query}%`}
          OR excerpt ILIKE ${`%${query}%`}
          OR content ILIKE ${`%${query}%`}
        )
    ),
    combined AS (
      SELECT 
        COALESCE(s.article_id, k.article_id) as article_id,
        COALESCE(s.title, k.title) as title,
        COALESCE(s.slug, k.slug) as slug,
        COALESCE(s.excerpt, k.excerpt) as excerpt,
        COALESCE(s.semantic_score, 0) as semantic_score,
        COALESCE(k.keyword_score, 0) as keyword_score,
        (
          ${semanticWeight} * COALESCE(s.semantic_score, 0) +
          ${keywordWeight} * COALESCE(k.keyword_score, 0)
        ) as combined_score
      FROM semantic_results s
      FULL OUTER JOIN keyword_results k ON s.article_id = k.article_id
    )
    SELECT *
    FROM combined
    WHERE combined_score > 0.1
    ORDER BY combined_score DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `) as any[];

  return results.map((row: any) => ({
    articleId: row.article_id,
    title: row.title,
    slug: row.slug,
    excerpt: row.excerpt,
    semanticScore: parseFloat(row.semantic_score),
    keywordScore: parseFloat(row.keyword_score),
    combinedScore: parseFloat(row.combined_score),
  }));
}

/**
 * Find related articles based on embedding similarity
 */
export async function findRelatedArticles(
  articleId: number,
  options: {
    limit?: number;
    threshold?: number;
  } = {}
): Promise<Array<{
  articleId: number;
  title: string;
  slug: string;
  excerpt: string | null;
  similarity: number;
}>> {
  const { limit = 5, threshold = 0.8 } = options;

  const results = await db.execute(sql`
    SELECT 
      a.id as article_id,
      a.title,
      a.slug,
      a.excerpt,
      1 - (e1.embedding <=> e2.embedding) as similarity
    FROM ${articles} a
    INNER JOIN ${article_embeddings} e1 ON a.id = e1.article_id
    CROSS JOIN ${article_embeddings} e2
    WHERE e2.article_id = ${articleId}
      AND a.id != ${articleId}
      AND a.status = 'published'
      AND 1 - (e1.embedding <=> e2.embedding) > ${threshold}
    ORDER BY e1.embedding <=> e2.embedding
    LIMIT ${limit}
  `) as any[];

  return results.map((row: any) => ({
    articleId: row.article_id,
    title: row.title,
    slug: row.slug,
    excerpt: row.excerpt,
    similarity: parseFloat(row.similarity),
  }));
}

/**
 * Delete embedding for an article
 */
export async function deleteArticleEmbedding(articleId: number): Promise<void> {
  await db
    .delete(article_embeddings)
    .where(eq(article_embeddings.articleId, articleId));
}

/**
 * Get embedding statistics
 */
export async function getEmbeddingStats(): Promise<{
  totalArticles: number;
  articlesWithEmbeddings: number;
  coverage: number;
}> {
  const [totalResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(articles)
    .where(eq(articles.status, 'published'));

  const [embeddingResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(article_embeddings);

  const totalArticles = Number(totalResult.count);
  const articlesWithEmbeddings = Number(embeddingResult.count);
  const coverage = totalArticles > 0 ? (articlesWithEmbeddings / totalArticles) * 100 : 0;

  return {
    totalArticles,
    articlesWithEmbeddings,
    coverage,
  };
}

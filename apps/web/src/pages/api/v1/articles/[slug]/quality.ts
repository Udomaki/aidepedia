/**
 * API Endpoint: Get Article Quality Score
 * GET /api/v1/articles/:slug/quality
 */

import type { APIRoute } from 'astro';
import { db, eq } from '@aidepedia/db';
import { articles, article_citations, article_quality_scores } from '@aidepedia/db/schema';
import { validateArticleQuality } from '../../../../../lib/article-generation';

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  try {
    const { slug } = params;

    if (!slug) {
      return new Response(JSON.stringify({ error: 'Slug is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get article
    const [article] = await db.select()
      .from(articles)
      .where(eq(articles.slug, slug))
      .limit(1);

    if (!article) {
      return new Response(JSON.stringify({ error: 'Article not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check if we have a cached quality score
    const [existingScore] = await db.select()
      .from(article_quality_scores)
      .where(eq(article_quality_scores.articleId, article.id))
      .orderBy(article_quality_scores.createdAt)
      .limit(1);

    // If article hasn't changed, return cached score
    if (existingScore && existingScore.createdAt > article.updatedAt) {
      return new Response(JSON.stringify({
        success: true,
        data: existingScore
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get citations
    const citations = await db.select()
      .from(article_citations)
      .where(eq(article_citations.articleId, article.id));

    // Calculate quality score
    const qualityResult = validateArticleQuality(
      article.title,
      article.content,
      citations.map(c => ({
        qualityScore: c.qualityScore || 0,
        qualityFlags: c.qualityFlags || []
      }))
    );

    // Save quality score
    const [qualityScore] = await db.insert(article_quality_scores).values({
      articleId: article.id,
      overallScore: qualityResult.overallScore,
      completenessScore: qualityResult.completenessScore,
      citationQualityScore: qualityResult.citationQualityScore,
      structureScore: qualityResult.structureScore,
      readabilityScore: qualityResult.readabilityScore,
      issues: qualityResult.issues,
      wordCount: qualityResult.metadata.wordCount,
      sectionCount: qualityResult.metadata.sectionCount,
      citationCount: qualityResult.metadata.citationCount
    }).returning();

    // Update article quality score
    await db.update(articles)
      .set({ qualityScore: qualityResult.overallScore })
      .where(eq(articles.id, article.id));

    return new Response(JSON.stringify({
      success: true,
      data: qualityScore
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Quality validation error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to validate article quality',
      message: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

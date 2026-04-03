/**
 * AI Article Summarization Service
 * Generates summaries and extracts key points from articles using Anthropic Claude
 */

import crypto from 'crypto';
import Anthropic from '@anthropic-ai/sdk';
import { db, eq, article_summaries, articles } from '@aidepedia/db';
import type { SummaryStyle, NewArticleSummary } from '@aidepedia/db';
import { summaryCache } from './summarization-cache';

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: import.meta.env.ANTHROPIC_API_KEY || '',
});

// Rate limiting: Track API calls per hour
const rateLimitWindow = 60 * 60 * 1000; // 1 hour in milliseconds
const maxApiCallsPerHour = parseInt(import.meta.env.ANTHROPIC_RATE_LIMIT || '100', 10);
const apiCallTimestamps: number[] = [];

/**
 * Check if rate limit would be exceeded
 */
function checkRateLimit(): boolean {
  const now = Date.now();

  // Remove timestamps outside the current window
  const validTimestamps = apiCallTimestamps.filter(
    (timestamp) => now - timestamp < rateLimitWindow
  );

  // Clear and refill the array
  apiCallTimestamps.length = 0;
  apiCallTimestamps.push(...validTimestamps);

  return apiCallTimestamps.length < maxApiCallsPerHour;
}

/**
 * Record an API call
 */
function recordApiCall(): void {
  apiCallTimestamps.push(Date.now());
}

/**
 * Get current rate limit status
 */
export function getRateLimitStatus() {
  const now = Date.now();
  const validTimestamps = apiCallTimestamps.filter(
    (timestamp) => now - timestamp < rateLimitWindow
  );

  return {
    used: validTimestamps.length,
    limit: maxApiCallsPerHour,
    remaining: maxApiCallsPerHour - validTimestamps.length,
    resetAt: new Date(
      Math.min(...validTimestamps) + rateLimitWindow
    ).toISOString(),
  };
}

/**
 * Generate a hash of article content for cache invalidation
 */
export function generateArticleHash(title: string, content: string, excerpt: string | null): string {
  const data = JSON.stringify({ title, content, excerpt: excerpt || '' });
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Generate summary prompt based on style
 */
function getSummaryPrompt(title: string, content: string, style: SummaryStyle): string {
  const basePrompt = `Please analyze the following article and provide a summary.

Title: ${title}

Content:
${content}

`;

  switch (style) {
    case 'brief':
      return basePrompt + `Provide a concise summary in 1-2 sentences (maximum 50 words).
Then extract exactly 3 key points as a bulleted list.

Respond in the following JSON format:
{
  "summary": "Your 1-2 sentence summary here",
  "keyPoints": ["First key point", "Second key point", "Third key point"]
}`;

    case 'bullets':
      return basePrompt + `Provide a summary as 5-6 bullet points that capture the main ideas.
Then extract 3-5 key takeaways as a separate bulleted list.

Respond in the following JSON format:
{
  "summary": "• First main idea\\n• Second main idea\\n• Third main idea\\n• Fourth main idea\\n• Fifth main idea",
  "keyPoints": ["First key takeaway", "Second key takeaway", "Third key takeaway", "Fourth key takeaway"]
}`;

    case 'detailed':
    default:
      return basePrompt + `Provide a comprehensive summary in 150-300 words that captures the main ideas, arguments, and conclusions.
Then extract 3-5 key points as a bulleted list.

Respond in the following JSON format:
{
  "summary": "Your comprehensive summary here (150-300 words)",
  "keyPoints": ["First key point", "Second key point", "Third key point", "Fourth key point", "Fifth key point"]
}`;
  }
}

/**
 * Generate summary using Anthropic Claude
 */
async function generateSummaryWithClaude(
  title: string,
  content: string,
  style: SummaryStyle
): Promise<{ summary: string; keyPoints: string[] }> {
  try {
    const prompt = getSummaryPrompt(title, content, style);

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    // Extract response text
    const responseText =
      message.content[0].type === 'text' ? message.content[0].text : '';

    // Parse JSON response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Could not parse JSON response from Claude');
    }

    const result = JSON.parse(jsonMatch[0]);

    return {
      summary: result.summary || '',
      keyPoints: result.keyPoints || [],
    };
  } catch (error) {
    console.error('Error generating summary with Claude:', error);
    throw error;
  }
}

/**
 * Fallback extractive summarization
 * Uses simple sentence extraction and frequency analysis
 */
function generateExtractiveSummary(
  title: string,
  content: string,
  style: SummaryStyle
): { summary: string; keyPoints: string[] } {
  // Split into sentences
  const sentences = content
    .replace(/\n+/g, ' ')
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 20 && s.length < 200);

  if (sentences.length === 0) {
    return {
      summary: 'Unable to generate summary for this article.',
      keyPoints: [],
    };
  }

  // Simple extractive summary - take first few sentences
  let summary = '';
  let numSentences = 2;

  switch (style) {
    case 'brief':
      numSentences = 1;
      break;
    case 'bullets':
      numSentences = 4;
      break;
    case 'detailed':
    default:
      numSentences = Math.min(5, sentences.length);
      break;
  }

  const selectedSentences = sentences.slice(0, numSentences);
  summary = selectedSentences.join('. ') + '.';

  // Extract key points from sentences
  const keyPoints = sentences
    .slice(0, 5)
    .map(s => {
      // Remove leading articles and capitalize first letter
      return s
        .replace(/^(The|This|These|Those|A|An)\s+/i, '')
        .charAt(0)
        .toUpperCase() + s.slice(1);
    })
    .filter(p => p.length > 15)
    .slice(0, 5);

  return {
    summary,
    keyPoints,
  };
}

/**
 * Generate or retrieve cached summary for an article
 */
export async function getArticleSummary(
  articleId: number,
  style: SummaryStyle = 'detailed',
  forceRegenerate = false
): Promise<{ summary: string; keyPoints: string[]; model: string }> {
  // Get article
  const [article] = await db
    .select()
    .from(articles)
    .where(eq(articles.id, articleId))
    .limit(1);

  if (!article) {
    throw new Error('Article not found');
  }

  // Generate hash for cache invalidation
  const articleHash = generateArticleHash(article.title, article.content, article.excerpt);

  // Check for existing summary unless force regenerate
  if (!forceRegenerate) {
    const [existingSummary] = await db
      .select()
      .from(article_summaries)
      .where(eq(article_summaries.articleId, articleId))
      .limit(1);

    if (existingSummary && existingSummary.articleHash === articleHash && existingSummary.style === style) {
      return {
        summary: existingSummary.summary,
        keyPoints: existingSummary.keyPoints,
        model: existingSummary.model,
      };
    }
  }

  // Generate new summary
  let summaryResult: { summary: string; keyPoints: string[] };

  try {
    summaryResult = await generateSummaryWithClaude(article.title, article.content, style);
  } catch (error) {
    console.warn('Claude API failed, falling back to extractive summarization:', error);
    summaryResult = generateExtractiveSummary(article.title, article.content, style);
  }

  // Calculate word count
  const wordCount = summaryResult.summary.split(/\s+/).length;

  // Prepare summary data
  const summaryData: NewArticleSummary = {
    articleId,
    summary: summaryResult.summary,
    keyPoints: summaryResult.keyPoints,
    style,
    model: 'claude-sonnet-4-6',
    articleHash,
    wordCount,
  };

  // Delete existing summary if any
  await db.delete(article_summaries).where(eq(article_summaries.articleId, articleId));

  // Insert new summary
  await db.insert(article_summaries).values(summaryData);

  return {
    summary: summaryResult.summary,
    keyPoints: summaryResult.keyPoints,
    model: summaryData.model,
  };
}

/**
 * Get cached summary without regenerating
 */
export async function getCachedSummary(articleId: number) {
  const [summary] = await db
    .select()
    .from(article_summaries)
    .where(eq(article_summaries.articleId, articleId))
    .limit(1);

  return summary || null;
}

/**
 * Delete summary for an article
 */
export async function deleteArticleSummary(articleId: number): Promise<void> {
  await db.delete(article_summaries).where(eq(article_summaries.articleId, articleId));
}

/**
 * Check if Anthropic API is configured
 */
export function isAnthropicConfigured(): boolean {
  return !!(import.meta.env.ANTHROPIC_API_KEY && import.meta.env.ANTHROPIC_API_KEY.length > 0);
}

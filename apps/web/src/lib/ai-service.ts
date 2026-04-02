import OpenAI from 'openai';
import type { Article } from '@aidepedia/db/schema';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: import.meta.env.OPENAI_API_KEY,
});

// Rate limiting configuration
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 30;
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

interface GrammarSuggestion {
  originalText: string;
  suggestedText: string;
  startOffset: number;
  endOffset: number;
  category: string;
  confidence: number;
  reasoning: string;
}

interface FactCheckResult {
  claim: string;
  status: 'verified' | 'unverified' | 'disputed' | 'needs_citation';
  confidence: number;
  sources: Array<{ url: string; title: string; reliability: number }>;
}

interface QualityScore {
  overallScore: number;
  completenessScore: number;
  accuracyScore: number;
  readabilityScore: number;
  citationScore: number;
  toneScore: number;
  improvements: Array<{
    category: string;
    priority: 'high' | 'medium' | 'low';
    suggestion: string;
    impact: number;
  }>;
}

interface ToneAnalysis {
  overallTone: string;
  biasDetected: boolean;
  biasType?: string;
  suggestions: Array<{
    text: string;
    issue: string;
    suggestion: string;
  }>;
}

interface CitationSuggestion {
  text: string;
  needsCitation: boolean;
  suggestedSources?: Array<{
    url: string;
    title: string;
    reliability: number;
  }>;
}

// Rate limiting check
function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const userLimit = rateLimitMap.get(userId);

  if (!userLimit || now > userLimit.resetTime) {
    rateLimitMap.set(userId, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (userLimit.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }

  userLimit.count++;
  return true;
}

// Grammar and style checking
export async function checkGrammarAndStyle(
  content: string,
  userId: string
): Promise<GrammarSuggestion[]> {
  if (!checkRateLimit(userId)) {
    throw new Error('Rate limit exceeded. Please wait before making more requests.');
  }

  const prompt = `Analyze the following text for grammar, style, and clarity issues. Follow encyclopedic writing standards (neutral, clear, concise, well-structured).

For each issue found, provide:
1. The original text
2. The suggested correction
3. The character offset (start and end position)
4. The category (e.g., "passive_voice", "wordiness", "clarity", "grammar", "spelling")
5. Confidence level (0-100)
6. Brief reasoning

Text to analyze:
"""
${content}
"""

Respond in JSON format:
{
  "suggestions": [
    {
      "originalText": "...",
      "suggestedText": "...",
      "startOffset": 0,
      "endOffset": 10,
      "category": "...",
      "confidence": 90,
      "reasoning": "..."
    }
  ]
}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [
      {
        role: 'system',
        content: 'You are an expert editor specializing in encyclopedic writing. Provide clear, actionable suggestions for improving text to meet Wikipedia-style standards.',
      },
      { role: 'user', content: prompt },
    ],
    temperature: 0.3,
    response_format: { type: 'json_object' },
  });

  const result = JSON.parse(response.choices[0].message.content || '{"suggestions":[]}');
  return result.suggestions || [];
}

// Fact verification
export async function verifyFacts(
  content: string,
  userId: string
): Promise<FactCheckResult[]> {
  if (!checkRateLimit(userId)) {
    throw new Error('Rate limit exceeded. Please wait before making more requests.');
  }

  const prompt = `Identify factual claims in the following text and assess their verifiability. For each claim:

1. Extract the claim
2. Determine verification status (verified/unverified/disputed/needs_citation)
3. Provide confidence level (0-100)
4. List reliable sources if available

Text to analyze:
"""
${content}
"""

Respond in JSON format:
{
  "claims": [
    {
      "claim": "...",
      "status": "verified|unverified|disputed|needs_citation",
      "confidence": 85,
      "sources": [
        {
          "url": "https://...",
          "title": "...",
          "reliability": 90
        }
      ]
    }
  ]
}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [
      {
        role: 'system',
        content: 'You are a fact-checker for an encyclopedia. Verify claims against reliable sources and provide accurate assessments.',
      },
      { role: 'user', content: prompt },
    ],
    temperature: 0.2,
    response_format: { type: 'json_object' },
  });

  const result = JSON.parse(response.choices[0].message.content || '{"claims":[]}');
  return result.claims || [];
}

// Quality scoring
export async function calculateQualityScore(
  article: Partial<Article>,
  userId: string
): Promise<QualityScore> {
  if (!checkRateLimit(userId)) {
    throw new Error('Rate limit exceeded. Please wait before making more requests.');
  }

  const prompt = `Analyze the following article and provide a comprehensive quality score based on encyclopedic standards.

Article title: ${article.title}
Article content:
"""
${article.content}
"""

Score each dimension from 0-100:
1. Completeness: Does the article cover the topic thoroughly?
2. Accuracy: Is the information likely to be accurate and well-sourced?
3. Readability: Is the writing clear and accessible?
4. Citations: Are claims properly cited?
5. Tone: Is the tone neutral and encyclopedic?

Also provide:
- Overall score (0-100)
- Improvement suggestions with priority (high/medium/low) and impact score

Respond in JSON format:
{
  "overallScore": 75,
  "completenessScore": 80,
  "accuracyScore": 70,
  "readabilityScore": 85,
  "citationScore": 60,
  "toneScore": 75,
  "improvements": [
    {
      "category": "citations",
      "priority": "high",
      "suggestion": "Add citations for claims in the first paragraph",
      "impact": 15
    }
  ]
}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [
      {
        role: 'system',
        content: 'You are an expert encyclopedia editor. Assess articles objectively based on Wikipedia-style quality standards.',
      },
      { role: 'user', content: prompt },
    ],
    temperature: 0.3,
    response_format: { type: 'json_object' },
  });

  const result = JSON.parse(response.choices[0].message.content || '{}');
  return {
    overallScore: result.overallScore || 0,
    completenessScore: result.completenessScore || 0,
    accuracyScore: result.accuracyScore || 0,
    readabilityScore: result.readabilityScore || 0,
    citationScore: result.citationScore || 0,
    toneScore: result.toneScore || 0,
    improvements: result.improvements || [],
  };
}

// Tone analysis
export async function analyzeTone(
  content: string,
  userId: string
): Promise<ToneAnalysis> {
  if (!checkRateLimit(userId)) {
    throw new Error('Rate limit exceeded. Please wait before making more requests.');
  }

  const prompt = `Analyze the tone of the following text for encyclopedic writing standards. Check for:

1. Overall tone (neutral, biased, promotional, etc.)
2. Bias detection (political, commercial, cultural, etc.)
3. Specific instances of non-neutral language
4. Suggestions for improvement

Text to analyze:
"""
${content}
"""

Respond in JSON format:
{
  "overallTone": "mostly neutral",
  "biasDetected": true,
  "biasType": "commercial",
  "suggestions": [
    {
      "text": "the best product on the market",
      "issue": "promotional language",
      "suggestion": "one of the leading products in the market"
    }
  ]
}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [
      {
        role: 'system',
        content: 'You are a neutral tone analyzer for encyclopedia content. Identify bias and non-neutral language objectively.',
      },
      { role: 'user', content: prompt },
    ],
    temperature: 0.2,
    response_format: { type: 'json_object' },
  });

  const result = JSON.parse(response.choices[0].message.content || '{}');
  return {
    overallTone: result.overallTone || 'neutral',
    biasDetected: result.biasDetected || false,
    biasType: result.biasType,
    suggestions: result.suggestions || [],
  };
}

// Citation suggestions
export async function suggestCitations(
  content: string,
  userId: string
): Promise<CitationSuggestion[]> {
  if (!checkRateLimit(userId)) {
    throw new Error('Rate limit exceeded. Please wait before making more requests.');
  }

  const prompt = `Identify claims in the following text that need citations and suggest reliable sources.

Text to analyze:
"""
${content}
"""

For each uncited claim, provide:
1. The text that needs citation
2. Whether it definitely needs a citation
3. Suggested reliable sources (if possible)

Respond in JSON format:
{
  "citations": [
    {
      "text": "The company was founded in 1995",
      "needsCitation": true,
      "suggestedSources": [
        {
          "url": "https://example.com/about",
          "title": "Company History",
          "reliability": 85
        }
      ]
    }
  ]
}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [
      {
        role: 'system',
        content: 'You are a citation expert for encyclopedia content. Identify uncited claims and suggest reliable, verifiable sources.',
      },
      { role: 'user', content: prompt },
    ],
    temperature: 0.3,
    response_format: { type: 'json_object' },
  });

  const result = JSON.parse(response.choices[0].message.content || '{"citations":[]}');
  return result.citations || [];
}

// Duplicate detection
export async function detectDuplicates(
  article: Partial<Article>,
  existingArticles: Array<Partial<Article>>,
  userId: string
): Promise<Array<{ articleId: number; similarityScore: number; matchingSections: string[] }>> {
  if (!checkRateLimit(userId)) {
    throw new Error('Rate limit exceeded. Please wait before making more requests.');
  }

  const duplicates: Array<{ articleId: number; similarityScore: number; matchingSections: string[] }> = [];

  for (const existing of existingArticles) {
    const prompt = `Compare these two articles and determine if they are duplicates or cover the same topic.

Article 1 (new):
Title: ${article.title}
Content: ${article.content?.substring(0, 1000)}

Article 2 (existing):
Title: ${existing.title}
Content: ${existing.content?.substring(0, 1000)}

Determine:
1. Similarity score (0-100)
2. Whether they should be merged
3. Key matching sections

Respond in JSON format:
{
  "similarityScore": 85,
  "shouldMerge": true,
  "matchingSections": ["Introduction covers same topic", "Similar historical background"]
}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are a duplicate detection system for an encyclopedia. Identify duplicate or highly similar articles objectively.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
      response_format: { type: 'json_object' },
    });

    const result = JSON.parse(response.choices[0].message.content || '{}');
    
    if (result.similarityScore >= 70 && existing.id) {
      duplicates.push({
        articleId: existing.id,
        similarityScore: result.similarityScore,
        matchingSections: result.matchingSections || [],
      });
    }
  }

  return duplicates;
}

// Generate suggested edits
export async function generateSuggestedEdits(
  article: Partial<Article>,
  userId: string
): Promise<Array<{
  type: string;
  originalText: string;
  suggestedText: string;
  reasoning: string;
  priority: 'high' | 'medium' | 'low';
}>> {
  if (!checkRateLimit(userId)) {
    throw new Error('Rate limit exceeded. Please wait before making more requests.');
  }

  const prompt = `Analyze this article and suggest improvements for encyclopedic quality.

Article title: ${article.title}
Article content:
"""
${article.content}
"""

Provide specific, actionable edits for:
1. Grammar and clarity
2. Completeness (missing information)
3. Citations (uncited claims)
4. Structure and organization
5. Neutral tone

For each suggestion, provide:
- Type (grammar/clarity/completeness/citation/structure/tone)
- Original text (if applicable)
- Suggested text
- Reasoning
- Priority (high/medium/low)

Respond in JSON format:
{
  "edits": [
    {
      "type": "clarity",
      "originalText": "The thing is really good",
      "suggestedText": "The product has received positive reviews",
      "reasoning": "Replaces vague language with more specific, encyclopedic phrasing",
      "priority": "medium"
    }
  ]
}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [
      {
        role: 'system',
        content: 'You are an expert encyclopedia editor. Suggest specific, actionable improvements to meet Wikipedia-style standards.',
      },
      { role: 'user', content: prompt },
    ],
    temperature: 0.3,
    response_format: { type: 'json_object' },
  });

  const result = JSON.parse(response.choices[0].message.content || '{"edits":[]}');
  return result.edits || [];
}

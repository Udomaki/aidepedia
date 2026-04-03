/**
 * AI-Powered Content Moderation Service
 * Uses OpenAI Moderation API for real-time content scanning
 */

export interface ModerationResult {
  flagged: boolean;
  categories: {
    hate: boolean;
    harassment: boolean;
    selfHarm: boolean;
    sexual: boolean;
    violence: boolean;
    spam?: boolean;
    misinformation?: boolean;
  };
  categoryScores: {
    hate: number;
    harassment: number;
    selfHarm: number;
    sexual: number;
    violence: number;
    spam?: number;
    misinformation?: number;
  };
  confidence: number;
}

export interface ContentToModerate {
  text: string;
  contentType: 'article' | 'comment' | 'user_profile';
  contentId: number;
  authorId?: number;
}

/**
 * Analyze content using OpenAI Moderation API
 */
export async function analyzeContent(content: ContentToModerate): Promise<ModerationResult> {
  // Check if OpenAI API key is configured
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    console.warn('OpenAI API key not configured, using fallback moderation');
    return fallbackModeration(content.text);
  }

  try {
    const response = await fetch('https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        input: content.text,
        model: 'omni-moderation-latest',
      }),
    });

    if (!response.ok) {
      console.error('OpenAI Moderation API error:', response.status, response.statusText);
      return fallbackModeration(content.text);
    }

    const data = await response.json();
    const result = data.results[0];

    // Map OpenAI categories to our categories
    const categories = {
      hate: result.categories.hate || false,
      harassment: result.categories.harassment || false,
      selfHarm: result.categories['self-harm'] || false,
      sexual: result.categories.sexual || false,
      violence: result.categories.violence || false,
      spam: result.categories.spam || false,
      misinformation: false, // Not directly available from OpenAI
    };

    const categoryScores = {
      hate: result.category_scores.hate || 0,
      harassment: result.category_scores.harassment || 0,
      selfHarm: result.category_scores['self-harm'] || 0,
      sexual: result.category_scores.sexual || 0,
      violence: result.category_scores.violence || 0,
      spam: result.category_scores.spam || 0,
      misinformation: 0,
    };

    // Calculate overall confidence (max of all category scores)
    const confidence = Math.max(...Object.values(categoryScores)) * 100;

    return {
      flagged: result.flagged,
      categories,
      categoryScores,
      confidence: Math.round(confidence),
    };
  } catch (error) {
    console.error('Error calling OpenAI Moderation API:', error);
    return fallbackModeration(content.text);
  }
}

/**
 * Fallback moderation using basic rules when OpenAI is not available
 */
function fallbackModeration(text: string): ModerationResult {
  // Basic spam detection patterns
  const spamPatterns = [
    /\b(buy now|click here|free money|make money fast|limited offer)\b/gi,
    /(.)\1{4,}/g, // Repeated characters
    /https?:\/\/[^\s]+/gi, // URLs (potential spam)
  ];

  // Basic harassment patterns
  const harassmentPatterns = [
    /\b(stupid|idiot|dumb|hate you|kill yourself)\b/gi,
  ];

  let spamScore = 0;
  let harassmentScore = 0;

  // Check spam patterns
  spamPatterns.forEach(pattern => {
    const matches = text.match(pattern);
    if (matches) {
      spamScore += matches.length * 0.2;
    }
  });

  // Check harassment patterns
  harassmentPatterns.forEach(pattern => {
    const matches = text.match(pattern);
    if (matches) {
      harassmentScore += matches.length * 0.3;
    }
  });

  // Normalize scores
  spamScore = Math.min(spamScore, 1);
  harassmentScore = Math.min(harassmentScore, 1);

  const categories = {
    hate: false,
    harassment: harassmentScore > 0.5,
    selfHarm: false,
    sexual: false,
    violence: false,
    spam: spamScore > 0.5,
    misinformation: false,
  };

  const categoryScores = {
    hate: 0,
    harassment: harassmentScore,
    selfHarm: 0,
    sexual: 0,
    violence: 0,
    spam: spamScore,
    misinformation: 0,
  };

  const confidence = Math.max(...Object.values(categoryScores)) * 100;

  return {
    flagged: spamScore > 0.5 || harassmentScore > 0.5,
    categories,
    categoryScores,
    confidence: Math.round(confidence),
  };
}

/**
 * Determine the primary category from moderation result
 */
export function getPrimaryCategory(result: ModerationResult): string {
  const scores = result.categoryScores;
  let maxScore = 0;
  let primaryCategory = 'spam';

  Object.entries(scores).forEach(([category, score]) => {
    if (score > maxScore) {
      maxScore = score;
      primaryCategory = category;
    }
  });

  return primaryCategory;
}

/**
 * Generate AI reasoning for the moderation decision
 */
export function generateReasoning(result: ModerationResult): string {
  const flaggedCategories: string[] = [];
  
  Object.entries(result.categories).forEach(([category, isFlagged]) => {
    if (isFlagged) {
      const score = result.categoryScores[category as keyof typeof result.categoryScores];
      flaggedCategories.push(`${category} (${(score * 100).toFixed(1)}% confidence)`);
    }
  });

  if (flaggedCategories.length === 0) {
    return 'Content appears to be safe.';
  }

  return `Content flagged for: ${flaggedCategories.join(', ')}. Overall confidence: ${result.confidence}%`;
}

/**
 * Batch moderation for multiple content items
 */
export async function batchModerate(
  contents: ContentToModerate[]
): Promise<Map<number, ModerationResult>> {
  const results = new Map<number, ModerationResult>();

  // Process in batches of 10 to avoid rate limits
  const batchSize = 10;
  for (let i = 0; i < contents.length; i += batchSize) {
    const batch = contents.slice(i, i + batchSize);
    
    const batchResults = await Promise.all(
      batch.map(async (content) => {
        const result = await analyzeContent(content);
        return { contentId: content.contentId, result };
      })
    );

    batchResults.forEach(({ contentId, result }) => {
      results.set(contentId, result);
    });

    // Add delay between batches to respect rate limits
    if (i + batchSize < contents.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  return results;
}

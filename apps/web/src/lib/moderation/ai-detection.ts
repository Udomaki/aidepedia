import type { Moderation } from 'openai/resources/moderations';

export interface ContentModerationResult {
  flagged: boolean;
  categories: {
    hate: boolean;
    hateThreatening: boolean;
    harassment: boolean;
    harassmentThreatening: boolean;
    selfHarm: boolean;
    selfHarmIntent: boolean;
    selfHarmInstructions: boolean;
    sexual: boolean;
    sexualMinors: boolean;
    violence: boolean;
    violenceGraphic: boolean;
  };
  categoryScores: {
    hate: number;
    hateThreatening: number;
    harassment: number;
    harassmentThreatening: number;
    selfHarm: number;
    selfHarmIntent: number;
    selfHarmInstructions: number;
    sexual: number;
    sexualMinors: number;
    violence: number;
    violenceGraphic: number;
  };
  confidence: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Analyze content using OpenAI's Moderation API
 * @param content - The text content to analyze
 * @returns Moderation result with flagged status and category scores
 */
export async function analyzeContent(content: string): Promise<ContentModerationResult> {
  try {
    const apiKey = import.meta.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      console.warn('OpenAI API key not configured, using fallback detection');
      return fallbackDetection(content);
    }

    const response = await fetch('https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        input: content,
        model: 'omni-moderation-latest',
      }),
    });

    if (!response.ok) {
      console.error('OpenAI moderation API error:', response.status, response.statusText);
      return fallbackDetection(content);
    }

    const data = await response.json() as { results: Moderation[] };
    const result = data.results[0];

    if (!result) {
      return fallbackDetection(content);
    }

    // Calculate confidence as average of category scores
    const scores = Object.values(result.category_scores) as number[];
    const confidence = scores.reduce((sum, score) => sum + score, 0) / scores.length;

    // Determine severity based on highest category score
    const maxScore = Math.max(...scores);
    let severity: 'low' | 'medium' | 'high' | 'critical';
    if (maxScore >= 0.9) {
      severity = 'critical';
    } else if (maxScore >= 0.7) {
      severity = 'high';
    } else if (maxScore >= 0.5) {
      severity = 'medium';
    } else {
      severity = 'low';
    }

    return {
      flagged: result.flagged,
      categories: {
        hate: result.categories.hate || false,
        hateThreatening: result.categories['hate/threatening'] || false,
        harassment: result.categories.harassment || false,
        harassmentThreatening: result.categories['harassment/threatening'] || false,
        selfHarm: result.categories['self-harm'] || false,
        selfHarmIntent: result.categories['self-harm/intent'] || false,
        selfHarmInstructions: result.categories['self-harm/instructions'] || false,
        sexual: result.categories.sexual || false,
        sexualMinors: result.categories['sexual/minors'] || false,
        violence: result.categories.violence || false,
        violenceGraphic: result.categories['violence/graphic'] || false,
      },
      categoryScores: {
        hate: result.category_scores.hate || 0,
        hateThreatening: result.category_scores['hate/threatening'] || 0,
        harassment: result.category_scores.harassment || 0,
        harassmentThreatening: result.category_scores['harassment/threatening'] || 0,
        selfHarm: result.category_scores['self-harm'] || 0,
        selfHarmIntent: result.category_scores['self-harm/intent'] || 0,
        selfHarmInstructions: result.category_scores['self-harm/instructions'] || 0,
        sexual: result.category_scores.sexual || 0,
        sexualMinors: result.category_scores['sexual/minors'] || 0,
        violence: result.category_scores.violence || 0,
        violenceGraphic: result.category_scores['violence/graphic'] || 0,
      },
      confidence,
      severity,
    };
  } catch (error) {
    console.error('Content moderation error:', error);
    return fallbackDetection(content);
  }
}

/**
 * Fallback detection using basic pattern matching
 * Used when OpenAI API is not available
 */
function fallbackDetection(content: string): ContentModerationResult {
  const lowerContent = content.toLowerCase();
  
  // Basic spam patterns
  const spamPatterns = [
    /\b(buy now|click here|free money|act now|limited time)\b/gi,
    /\b(viagra|cialis|casino|lottery|winner)\b/gi,
    /(https?:\/\/[^\s]+)/gi, // URLs
  ];

  // Toxic language patterns
  const toxicPatterns = [
    /\b(idiot|stupid|moron|retard|dumb)\b/gi,
    /\b(hate|kill|die|destroy)\b/gi,
  ];

  let spamScore = 0;
  let toxicScore = 0;

  spamPatterns.forEach(pattern => {
    const matches = content.match(pattern);
    if (matches) {
      spamScore += matches.length * 0.2;
    }
  });

  toxicPatterns.forEach(pattern => {
    const matches = content.match(pattern);
    if (matches) {
      toxicScore += matches.length * 0.3;
    }
  });

  const maxScore = Math.min(Math.max(spamScore, toxicScore), 1);
  const flagged = maxScore > 0.5;

  return {
    flagged,
    categories: {
      hate: toxicScore > 0.7,
      hateThreatening: false,
      harassment: toxicScore > 0.6,
      harassmentThreatening: false,
      selfHarm: false,
      selfHarmIntent: false,
      selfHarmInstructions: false,
      sexual: false,
      sexualMinors: false,
      violence: toxicScore > 0.8,
      violenceGraphic: false,
    },
    categoryScores: {
      hate: toxicScore,
      hateThreatening: 0,
      harassment: toxicScore * 0.8,
      harassmentThreatening: 0,
      selfHarm: 0,
      selfHarmIntent: 0,
      selfHarmInstructions: 0,
      sexual: 0,
      sexualMinors: 0,
      violence: toxicScore,
      violenceGraphic: 0,
    },
    confidence: maxScore,
    severity: maxScore >= 0.9 ? 'critical' : maxScore >= 0.7 ? 'high' : maxScore >= 0.5 ? 'medium' : 'low',
  };
}

/**
 * Batch analyze multiple content items
 */
export async function batchAnalyzeContent(items: string[]): Promise<ContentModerationResult[]> {
  return Promise.all(items.map(analyzeContent));
}

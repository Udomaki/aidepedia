export interface SentimentResult {
  score: number; // -1 to 1 (negative to positive)
  magnitude: number; // 0 to 1 (strength of sentiment)
  label: 'very_negative' | 'negative' | 'neutral' | 'positive' | 'very_positive';
  flagged: boolean; // True if extremely negative
  confidence: number;
  keywords: {
    word: string;
    sentiment: number;
  }[];
}

/**
 * Analyze sentiment of text content
 * Uses a combination of keyword analysis and heuristics
 */
export async function analyzeSentiment(content: string): Promise<SentimentResult> {
  try {
    // Predefined sentiment lexicon (simplified version)
    const positiveWords: Record<string, number> = {
      'good': 0.7,
      'great': 0.8,
      'excellent': 0.9,
      'amazing': 0.9,
      'wonderful': 0.9,
      'fantastic': 0.85,
      'love': 0.8,
      'happy': 0.75,
      'joy': 0.8,
      'delighted': 0.85,
      'perfect': 0.9,
      'beautiful': 0.8,
      'awesome': 0.85,
      'outstanding': 0.9,
      'brilliant': 0.9,
      'success': 0.75,
      'successful': 0.75,
      'best': 0.8,
      'better': 0.6,
      'improve': 0.65,
      'improved': 0.65,
      'helpful': 0.7,
      'useful': 0.65,
      'recommend': 0.7,
      'enjoy': 0.75,
      'enjoyed': 0.75,
      'nice': 0.6,
      'pleasant': 0.65,
      'positive': 0.7,
      'beneficial': 0.7,
    };

    const negativeWords: Record<string, number> = {
      'bad': -0.7,
      'terrible': -0.9,
      'awful': -0.9,
      'horrible': -0.9,
      'hate': -0.9,
      'disgusting': -0.85,
      'pathetic': -0.8,
      'worst': -0.9,
      'worse': -0.7,
      'poor': -0.65,
      'fail': -0.75,
      'failed': -0.75,
      'failure': -0.75,
      'useless': -0.8,
      'worthless': -0.85,
      'stupid': -0.8,
      'idiot': -0.85,
      'dumb': -0.75,
      'annoying': -0.65,
      'frustrating': -0.7,
      'disappointing': -0.7,
      'disappointed': -0.7,
      'sad': -0.6,
      'angry': -0.75,
      'furious': -0.85,
      'outrageous': -0.8,
      'scam': -0.9,
      'fraud': -0.9,
      'fake': -0.7,
      'lie': -0.75,
      'lies': -0.75,
      'dangerous': -0.8,
      'harmful': -0.8,
      'negative': -0.6,
      'problem': -0.5,
      'problems': -0.5,
      'issue': -0.4,
      'issues': -0.4,
    };

    const intensifiers = ['very', 'extremely', 'incredibly', 'absolutely', 'completely', 'totally'];
    const negators = ['not', "n't", 'never', 'no', 'none', 'neither', 'nobody', 'nothing'];

    // Tokenize content
    const words = content.toLowerCase().split(/\s+/);
    const keywords: Array<{ word: string; sentiment: number }> = [];
    
    let totalSentiment = 0;
    let wordCount = 0;
    let negated = false;
    let intensified = false;

    for (let i = 0; i < words.length; i++) {
      const word = words[i].replace(/[^a-z]/g, '');
      
      if (word.length === 0) continue;

      // Check for negators
      if (negators.includes(word)) {
        negated = true;
        continue;
      }

      // Check for intensifiers
      if (intensifiers.includes(word)) {
        intensified = true;
        continue;
      }

      // Get sentiment score
      let sentiment = positiveWords[word] || negativeWords[word] || 0;

      if (sentiment !== 0) {
        // Apply negation
        if (negated) {
          sentiment *= -0.5;
          negated = false;
        }

        // Apply intensifier
        if (intensified) {
          sentiment *= 1.5;
          intensified = false;
        }

        // Clamp to -1 to 1 range
        sentiment = Math.max(-1, Math.min(1, sentiment));

        totalSentiment += sentiment;
        wordCount++;
        keywords.push({ word, sentiment });
      }

      // Reset flags after a few words
      if (i > 0 && (i % 3 === 0)) {
        negated = false;
        intensified = false;
      }
    }

    // Calculate average sentiment
    const avgSentiment = wordCount > 0 ? totalSentiment / wordCount : 0;
    
    // Calculate magnitude (absolute average)
    const magnitude = Math.abs(avgSentiment);

    // Determine label
    let label: SentimentResult['label'];
    if (avgSentiment <= -0.7) {
      label = 'very_negative';
    } else if (avgSentiment <= -0.3) {
      label = 'negative';
    } else if (avgSentiment <= 0.3) {
      label = 'neutral';
    } else if (avgSentiment <= 0.7) {
      label = 'positive';
    } else {
      label = 'very_positive';
    }

    // Flag if extremely negative
    const flagged = avgSentiment <= -0.7;

    // Confidence based on number of sentiment words found
    const confidence = Math.min(wordCount / 10, 1);

    return {
      score: avgSentiment,
      magnitude,
      label,
      flagged,
      confidence,
      keywords: keywords.slice(0, 10), // Top 10 keywords
    };
  } catch (error) {
    console.error('Sentiment analysis error:', error);
    return {
      score: 0,
      magnitude: 0,
      label: 'neutral',
      flagged: false,
      confidence: 0,
      keywords: [],
    };
  }
}

/**
 * Batch analyze sentiment for multiple content items
 */
export async function batchAnalyzeSentiment(items: string[]): Promise<SentimentResult[]> {
  return Promise.all(items.map(analyzeSentiment));
}

export interface ImageModerationResult {
  approved: boolean;
  flagged: boolean;
  confidence: number;
  categories: {
    violence: boolean;
    sexual: boolean;
    hate_symbols: boolean;
    inappropriate: boolean;
  };
  categoryScores: {
    violence: number;
    sexual: number;
    hate_symbols: number;
    inappropriate: number;
  };
  reason?: string;
  suggestedAction: 'approve' | 'review' | 'reject';
}

/**
 * Analyze image content for moderation
 * Uses OpenAI's Vision API for image analysis
 */
export async function analyzeImage(imageUrl: string): Promise<ImageModerationResult> {
  try {
    const apiKey = import.meta.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      console.warn('OpenAI API key not configured, using fallback image detection');
      return fallbackImageDetection(imageUrl);
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Analyze this image for content moderation. Check for:
1. Violence or gore
2. Sexual or adult content
3. Hate symbols or offensive imagery
4. Any other inappropriate content

Respond in JSON format with:
{
  "approved": boolean,
  "flagged": boolean,
  "confidence": number (0-1),
  "categories": {
    "violence": boolean,
    "sexual": boolean,
    "hate_symbols": boolean,
    "inappropriate": boolean
  },
  "categoryScores": {
    "violence": number (0-1),
    "sexual": number (0-1),
    "hate_symbols": number (0-1),
    "inappropriate": number (0-1)
  },
  "reason": "string (if flagged, explain why)",
  "suggestedAction": "approve" | "review" | "reject"
}

Be conservative - only flag content that is clearly inappropriate.`,
              },
              {
                type: 'image_url',
                image_url: {
                  url: imageUrl,
                },
              },
            ],
          },
        ],
        max_tokens: 500,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      console.error('OpenAI Vision API error:', response.status, response.statusText);
      return fallbackImageDetection(imageUrl);
    }

    const data = await response.json() as { choices: Array<{ message: { content: string } }> };
    const content = data.choices[0]?.message?.content;

    if (!content) {
      return fallbackImageDetection(imageUrl);
    }

    const result = JSON.parse(content) as ImageModerationResult;
    return result;
  } catch (error) {
    console.error('Image moderation error:', error);
    return fallbackImageDetection(imageUrl);
  }
}

/**
 * Fallback image detection (always approves)
 * Used when Vision API is not available
 */
function fallbackImageDetection(imageUrl: string): ImageModerationResult {
  // Check for suspicious URL patterns
  const suspiciousPatterns = [
    /adult/i,
    /xxx/i,
    /porn/i,
    /nsfw/i,
    /gore/i,
    /violence/i,
  ];

  const isSuspicious = suspiciousPatterns.some(pattern => pattern.test(imageUrl));

  if (isSuspicious) {
    return {
      approved: false,
      flagged: true,
      confidence: 0.5,
      categories: {
        violence: false,
        sexual: false,
        hate_symbols: false,
        inappropriate: true,
      },
      categoryScores: {
        violence: 0,
        sexual: 0,
        hate_symbols: 0,
        inappropriate: 0.5,
      },
      reason: 'Suspicious URL pattern detected',
      suggestedAction: 'review',
    };
  }

  return {
    approved: true,
    flagged: false,
    confidence: 0.5,
    categories: {
      violence: false,
      sexual: false,
      hate_symbols: false,
      inappropriate: false,
    },
    categoryScores: {
      violence: 0,
      sexual: 0,
      hate_symbols: 0,
      inappropriate: 0,
    },
    suggestedAction: 'approve',
  };
}

/**
 * Batch analyze multiple images
 */
export async function batchAnalyzeImages(urls: string[]): Promise<ImageModerationResult[]> {
  // Process in batches of 5 to avoid rate limits
  const batchSize = 5;
  const results: ImageModerationResult[] = [];

  for (let i = 0; i < urls.length; i += batchSize) {
    const batch = urls.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(analyzeImage));
    results.push(...batchResults);
    
    // Add delay between batches to respect rate limits
    if (i + batchSize < urls.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  return results;
}

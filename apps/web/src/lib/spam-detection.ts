/**
 * Spam Detection Service
 * ML-based spam identification with confidence scoring
 */

export interface SpamFeatures {
  textLength: number;
  wordCount: number;
  avgWordLength: number;
  specialCharRatio: number;
  uppercaseRatio: number;
  linkCount: number;
  repetitionScore: number;
  readabilityScore: number;
  sentimentScore: number;
  languageDetected: string;
  gibberishProbability: number;
}

export interface SpamAnalysisResult {
  isSpam: boolean;
  spamType: 'gibberish' | 'promotional' | 'duplicate' | 'off_topic' | 'low_quality' | 'malicious';
  spamScore: number;
  confidence: number;
  features: SpamFeatures;
  reasons: string[];
}

/**
 * Extract features from text for spam classification
 */
export function extractSpamFeatures(text: string, title: string = ''): SpamFeatures {
  const fullText = `${title} ${text}`.trim();
  
  return {
    textLength: fullText.length,
    wordCount: countWords(fullText),
    avgWordLength: calculateAvgWordLength(fullText),
    specialCharRatio: calculateSpecialCharRatio(fullText),
    uppercaseRatio: calculateUppercaseRatio(fullText),
    linkCount: countLinks(fullText),
    repetitionScore: calculateRepetitionScore(fullText),
    readabilityScore: calculateReadabilityScore(fullText),
    sentimentScore: analyzeSentiment(fullText),
    languageDetected: detectLanguage(fullText),
    gibberishProbability: detectGibberish(fullText)
  };
}

/**
 * Analyze text for spam characteristics
 */
export function analyzeSpam(text: string, title: string = ''): SpamAnalysisResult {
  const features = extractSpamFeatures(text, title);
  const reasons: string[] = [];
  
  // Calculate spam score based on multiple factors
  let spamScore = 0;
  
  // 1. Gibberish detection (0-30 points)
  if (features.gibberishProbability > 0.7) {
    spamScore += 30;
    reasons.push('High gibberish probability detected');
  } else if (features.gibberishProbability > 0.5) {
    spamScore += 20;
    reasons.push('Moderate gibberish patterns found');
  } else if (features.gibberishProbability > 0.3) {
    spamScore += 10;
    reasons.push('Some unusual text patterns detected');
  }
  
  // 2. Content quality (0-25 points)
  if (features.wordCount < 10) {
    spamScore += 20;
    reasons.push('Content is too short');
  } else if (features.wordCount < 30) {
    spamScore += 10;
    reasons.push('Content is very short');
  }
  
  if (features.avgWordLength < 3) {
    spamScore += 15;
    reasons.push('Average word length is unusually short');
  }
  
  // 3. Formatting issues (0-20 points)
  if (features.uppercaseRatio > 0.5) {
    spamScore += 15;
    reasons.push('Excessive use of uppercase letters');
  } else if (features.uppercaseRatio > 0.3) {
    spamScore += 8;
    reasons.push('High uppercase ratio');
  }
  
  if (features.specialCharRatio > 0.3) {
    spamScore += 15;
    reasons.push('Excessive special characters');
  } else if (features.specialCharRatio > 0.2) {
    spamScore += 8;
    reasons.push('High special character ratio');
  }
  
  // 4. Repetition (0-15 points)
  if (features.repetitionScore > 0.7) {
    spamScore += 15;
    reasons.push('High content repetition');
  } else if (features.repetitionScore > 0.5) {
    spamScore += 10;
    reasons.push('Moderate content repetition');
  }
  
  // 5. Promotional content (0-10 points)
  if (features.linkCount > 5) {
    spamScore += 10;
    reasons.push('Excessive links detected');
  } else if (features.linkCount > 3) {
    spamScore += 5;
    reasons.push('Multiple links detected');
  }
  
  // Check for promotional keywords
  const promotionalScore = detectPromotionalContent(text);
  if (promotionalScore > 0.5) {
    spamScore += 10;
    reasons.push('Promotional language detected');
  }
  
  // 6. Readability (0-5 points)
  if (features.readabilityScore < 20) {
    spamScore += 5;
    reasons.push('Very low readability score');
  }
  
  // Normalize spam score to 0-100
  spamScore = Math.min(100, spamScore);
  
  // Determine spam type
  const spamType = determineSpamType(features, spamScore, reasons);
  
  // Calculate confidence based on feature consistency
  const confidence = calculateConfidence(features, spamScore);
  
  return {
    isSpam: spamScore >= 50,
    spamType,
    spamScore: Math.round(spamScore * 100) / 100,
    confidence: Math.round(confidence * 100) / 100,
    features,
    reasons
  };
}

/**
 * Determine the type of spam
 */
function determineSpamType(
  features: SpamFeatures,
  spamScore: number,
  reasons: string[]
): SpamAnalysisResult['spamType'] {
  // Check for gibberish
  if (features.gibberishProbability > 0.7 || reasons.some(r => r.includes('gibberish'))) {
    return 'gibberish';
  }
  
  // Check for promotional content
  if (reasons.some(r => r.includes('Promotional')) || features.linkCount > 3) {
    return 'promotional';
  }
  
  // Check for low quality
  if (features.wordCount < 30 || features.readabilityScore < 30) {
    return 'low_quality';
  }
  
  // Check for off-topic (would need context comparison)
  if (features.sentimentScore < -0.7) {
    return 'off_topic';
  }
  
  // Default based on score
  if (spamScore >= 70) {
    return 'gibberish';
  } else if (spamScore >= 50) {
    return 'low_quality';
  }
  
  return 'low_quality';
}

/**
 * Calculate confidence in the spam classification
 */
function calculateConfidence(features: SpamFeatures, spamScore: number): number {
  // Higher confidence when multiple features agree
  let confidence = 50;
  
  // Adjust based on number of spam indicators
  if (features.gibberishProbability > 0.7) confidence += 15;
  if (features.wordCount < 20) confidence += 10;
  if (features.uppercaseRatio > 0.4) confidence += 10;
  if (features.repetitionScore > 0.6) confidence += 10;
  if (features.specialCharRatio > 0.25) confidence += 5;
  
  // Adjust based on spam score
  if (spamScore >= 80) confidence += 15;
  else if (spamScore >= 60) confidence += 10;
  else if (spamScore >= 40) confidence += 5;
  
  // Reduce confidence for borderline cases
  if (spamScore >= 40 && spamScore <= 60) {
    confidence -= 20;
  }
  
  return Math.min(100, Math.max(0, confidence));
}

// Helper functions

function countWords(text: string): number {
  return text.split(/\s+/).filter(word => word.length > 0).length;
}

function calculateAvgWordLength(text: string): number {
  const words = text.split(/\s+/).filter(word => word.length > 0);
  if (words.length === 0) return 0;
  
  const totalLength = words.reduce((sum, word) => sum + word.length, 0);
  return totalLength / words.length;
}

function calculateSpecialCharRatio(text: string): number {
  const specialChars = text.replace(/[\w\s]/g, '').length;
  return text.length > 0 ? specialChars / text.length : 0;
}

function calculateUppercaseRatio(text: string): number {
  const letters = text.replace(/[^a-zA-Z]/g, '');
  if (letters.length === 0) return 0;
  
  const uppercase = letters.replace(/[^A-Z]/g, '').length;
  return uppercase / letters.length;
}

function countLinks(text: string): number {
  const urlPattern = /https?:\/\/[^\s]+/gi;
  const matches = text.match(urlPattern);
  return matches ? matches.length : 0;
}

function calculateRepetitionScore(text: string): number {
  const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 0);
  if (words.length === 0) return 0;
  
  const wordCounts = new Map<string, number>();
  words.forEach(word => {
    wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
  });
  
  // Calculate ratio of repeated words
  let repeatedWords = 0;
  wordCounts.forEach(count => {
    if (count > 1) repeatedWords += count - 1;
  });
  
  return repeatedWords / words.length;
}

function calculateReadabilityScore(text: string): number {
  // Simplified Flesch reading ease score
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  
  if (words.length === 0 || sentences.length === 0) return 0;
  
  const avgWordsPerSentence = words.length / sentences.length;
  const avgSyllablesPerWord = estimateSyllables(text) / words.length;
  
  const score = 206.835 - (1.015 * avgWordsPerSentence) - (84.6 * avgSyllablesPerWord);
  
  return Math.max(0, Math.min(100, score));
}

function estimateSyllables(text: string): number {
  const words = text.toLowerCase().split(/\s+/);
  let totalSyllables = 0;
  
  words.forEach(word => {
    word = word.replace(/[^a-z]/g, '');
    if (word.length === 0) return;
    
    let syllables = word.match(/[aeiouy]+/g)?.length || 1;
    if (word.endsWith('e')) syllables--;
    if (syllables === 0) syllables = 1;
    
    totalSyllables += syllables;
  });
  
  return totalSyllables;
}

function analyzeSentiment(text: string): number {
  // Simple sentiment analysis based on word lists
  const positiveWords = ['good', 'great', 'excellent', 'amazing', 'wonderful', 'best', 'love', 'helpful'];
  const negativeWords = ['bad', 'terrible', 'awful', 'worst', 'hate', 'horrible', 'poor', 'useless'];
  
  const words = text.toLowerCase().split(/\s+/);
  let score = 0;
  
  words.forEach(word => {
    if (positiveWords.includes(word)) score++;
    if (negativeWords.includes(word)) score--;
  });
  
  // Normalize to -1 to 1
  return words.length > 0 ? score / words.length : 0;
}

function detectLanguage(text: string): string {
  // Simple language detection (default to English)
  // In production, would use a proper language detection library
  const englishPattern = /^[a-zA-Z0-9\s\.,!?;:'"()\-]+$/;
  return englishPattern.test(text.substring(0, 100)) ? 'en' : 'unknown';
}

function detectGibberish(text: string): number {
  const words = text.split(/\s+/).filter(w => w.length > 0);
  if (words.length === 0) return 0;
  
  let gibberishScore = 0;
  
  words.forEach(word => {
    // Check for random character sequences
    if (!/[aeiou]/i.test(word) && word.length > 4) {
      gibberishScore += 0.3;
    }
    
    // Check for excessive consonants
    const consonants = word.replace(/[aeiou]/gi, '').length;
    if (word.length > 5 && consonants / word.length > 0.8) {
      gibberishScore += 0.2;
    }
    
    // Check for repeated characters
    if (/(.)\1{3,}/.test(word)) {
      gibberishScore += 0.2;
    }
    
    // Check for random capitalization
    const caps = (word.match(/[A-Z]/g) || []).length;
    const lowercase = (word.match(/[a-z]/g) || []).length;
    if (caps > 0 && lowercase > 0 && Math.abs(caps - lowercase) < 2 && word.length > 4) {
      gibberishScore += 0.2;
    }
  });
  
  return Math.min(1, gibberishScore / words.length);
}

function detectPromotionalContent(text: string): number {
  const promotionalKeywords = [
    'buy now', 'click here', 'free', 'discount', 'offer', 'limited time',
    'act now', 'order now', 'special offer', 'best price', 'cheap',
    'earn money', 'make money', 'work from home', 'guaranteed',
    'no risk', 'winner', 'congratulations', 'subscribe', 'follow us'
  ];
  
  const lowerText = text.toLowerCase();
  let matches = 0;
  
  promotionalKeywords.forEach(keyword => {
    if (lowerText.includes(keyword)) {
      matches++;
    }
  });
  
  return Math.min(1, matches / 5); // Normalize to 0-1
}

/**
 * Batch analyze multiple texts
 */
export function batchAnalyzeSpam(
  items: Array<{ id: number; text: string; title?: string }>
): Array<{ id: number; analysis: SpamAnalysisResult }> {
  return items.map(item => ({
    id: item.id,
    analysis: analyzeSpam(item.text, item.title || '')
  }));
}

/**
 * Get spam severity level
 */
export function getSpamSeverity(spamScore: number): 'low' | 'medium' | 'high' | 'critical' {
  if (spamScore >= 80) return 'critical';
  if (spamScore >= 65) return 'high';
  if (spamScore >= 50) return 'medium';
  return 'low';
}

/**
 * Get recommended action based on spam analysis
 */
export function getRecommendedAction(analysis: SpamAnalysisResult): 'auto_approve' | 'auto_reject' | 'manual_review' {
  if (analysis.confidence >= 90 && analysis.spamScore >= 80) {
    return 'auto_reject';
  }
  
  if (analysis.confidence >= 85 && analysis.spamScore < 30) {
    return 'auto_approve';
  }
  
  return 'manual_review';
}

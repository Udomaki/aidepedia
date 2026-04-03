/**
 * Quality Validator
 * Validates article quality and completeness
 */

export interface QualityIssue {
  type: string;
  severity: 'low' | 'medium' | 'high';
  message: string;
  section?: string;
}

export interface QualityScore {
  overallScore: number;
  completenessScore: number;
  citationQualityScore: number;
  structureScore: number;
  readabilityScore: number;
  issues: QualityIssue[];
  metadata: {
    wordCount: number;
    sectionCount: number;
    citationCount: number;
  };
}

/**
 * Validate article quality
 */
export function validateArticleQuality(
  title: string,
  content: string,
  citations: Array<{ qualityScore: number; qualityFlags: string[] }>
): QualityScore {
  const metadata = extractMetadata(content, citations);
  const issues: QualityIssue[] = [];

  // Calculate individual scores
  const completenessScore = calculateCompletenessScore(title, content, metadata, issues);
  const citationQualityScore = calculateCitationQualityScore(citations, issues);
  const structureScore = calculateStructureScore(content, metadata, issues);
  const readabilityScore = calculateReadabilityScore(content, issues);

  // Calculate overall score (weighted average)
  const overallScore = Math.round(
    completenessScore * 0.3 +
    citationQualityScore * 0.25 +
    structureScore * 0.25 +
    readabilityScore * 0.2
  );

  return {
    overallScore,
    completenessScore,
    citationQualityScore,
    structureScore,
    readabilityScore,
    issues,
    metadata
  };
}

/**
 * Extract metadata from content
 */
function extractMetadata(
  content: string,
  citations: Array<{ qualityScore: number; qualityFlags: string[] }>
): { wordCount: number; sectionCount: number; citationCount: number } {
  const wordCount = content.split(/\s+/).filter(w => w.length > 0).length;
  
  // Count sections (## headings)
  const sectionMatches = content.match(/^##\s+.+$/gm);
  const sectionCount = sectionMatches ? sectionMatches.length : 0;

  const citationCount = citations.length;

  return { wordCount, sectionCount, citationCount };
}

/**
 * Calculate completeness score
 */
function calculateCompletenessScore(
  title: string,
  content: string,
  metadata: { wordCount: number; sectionCount: number; citationCount: number },
  issues: QualityIssue[]
): number {
  let score = 100;

  // Check title
  if (!title || title.trim().length === 0) {
    score -= 20;
    issues.push({
      type: 'missing_title',
      severity: 'high',
      message: 'Article is missing a title'
    });
  }

  // Check word count
  if (metadata.wordCount < 500) {
    score -= 30;
    issues.push({
      type: 'too_short',
      severity: 'high',
      message: `Article is too short (${metadata.wordCount} words). Recommended: 1500-3000 words`
    });
  } else if (metadata.wordCount < 1000) {
    score -= 15;
    issues.push({
      type: 'short',
      severity: 'medium',
      message: `Article could be more comprehensive (${metadata.wordCount} words). Recommended: 1500-3000 words`
    });
  }

  // Check sections
  if (metadata.sectionCount < 3) {
    score -= 20;
    issues.push({
      type: 'insufficient_sections',
      severity: 'medium',
      message: 'Article should have at least 3 main sections'
    });
  }

  // Check citations
  if (metadata.citationCount === 0) {
    score -= 20;
    issues.push({
      type: 'no_citations',
      severity: 'high',
      message: 'Article has no citations. Add sources to support claims'
    });
  } else if (metadata.citationCount < 3) {
    score -= 10;
    issues.push({
      type: 'few_citations',
      severity: 'medium',
      message: 'Article has few citations. Consider adding more sources'
    });
  }

  return Math.max(0, score);
}

/**
 * Calculate citation quality score
 */
function calculateCitationQualityScore(
  citations: Array<{ qualityScore: number; qualityFlags: string[] }>,
  issues: QualityIssue[]
): number {
  if (citations.length === 0) return 0;

  const avgQuality = citations.reduce((sum, c) => sum + c.qualityScore, 0) / citations.length;

  // Check for low-quality citations
  citations.forEach((citation, index) => {
    if (citation.qualityScore < 60) {
      issues.push({
        type: 'low_quality_citation',
        severity: 'medium',
        message: `Citation ${index + 1} has low quality score (${citation.qualityScore}/100)`,
        section: 'References'
      });
    }

    if (citation.qualityFlags.includes('missing_author')) {
      issues.push({
        type: 'citation_missing_author',
        severity: 'low',
        message: `Citation ${index + 1} is missing author information`,
        section: 'References'
      });
    }
  });

  return Math.round(avgQuality);
}

/**
 * Calculate structure score
 */
function calculateStructureScore(
  content: string,
  metadata: { wordCount: number; sectionCount: number; citationCount: number },
  issues: QualityIssue[]
): number {
  let score = 100;

  // Check for introduction (first paragraph before first ##)
  const hasIntroduction = /^[^#]+##/.test(content);
  if (!hasIntroduction) {
    score -= 15;
    issues.push({
      type: 'missing_introduction',
      severity: 'medium',
      message: 'Article should have an introduction before the first section'
    });
  }

  // Check for proper heading hierarchy
  const headings = content.match(/^#{1,3}\s+.+$/gm) || [];
  const hasProperHierarchy = validateHeadingHierarchy(headings);
  if (!hasProperHierarchy) {
    score -= 10;
    issues.push({
      type: 'heading_hierarchy',
      severity: 'low',
      message: 'Heading hierarchy should be consistent (H1 → H2 → H3)'
    });
  }

  // Check for references section
  const hasReferences = /##\s*(References|Bibliography|Sources)/i.test(content);
  if (!hasReferences && metadata.citationCount > 0) {
    score -= 15;
    issues.push({
      type: 'missing_references_section',
      severity: 'medium',
      message: 'Article has citations but no References section'
    });
  }

  // Check for balanced sections
  if (metadata.sectionCount >= 3) {
    const sections = content.split(/^##\s+/gm).slice(1);
    const sectionLengths = sections.map(s => s.split(/\s+/).length);
    const avgLength = sectionLengths.reduce((a, b) => a + b, 0) / sectionLengths.length;
    
    const unbalancedSections = sectionLengths.filter(len => len < avgLength * 0.3);
    if (unbalancedSections.length > 0) {
      score -= 10;
      issues.push({
        type: 'unbalanced_sections',
        severity: 'low',
        message: 'Some sections are significantly shorter than others'
      });
    }
  }

  return Math.max(0, score);
}

/**
 * Validate heading hierarchy
 */
function validateHeadingHierarchy(headings: string[]): boolean {
  if (headings.length === 0) return true;

  const levels = headings.map(h => (h.match(/^#+/) || [''])[0].length);
  
  // Should start with H1 or H2
  if (levels[0] > 2) return false;

  // Should not skip levels (e.g., H1 → H3)
  for (let i = 1; i < levels.length; i++) {
    if (levels[i] - levels[i - 1] > 1) return false;
  }

  return true;
}

/**
 * Calculate readability score
 * Simplified Flesch Reading Ease approximation
 */
function calculateReadabilityScore(content: string, issues: QualityIssue[]): number {
  const words = content.split(/\s+/).filter(w => w.length > 0);
  const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
  
  if (words.length === 0 || sentences.length === 0) return 50;

  const avgWordsPerSentence = words.length / sentences.length;
  
  // Count complex words (> 3 syllables, simplified check)
  const complexWords = words.filter(word => {
    const syllables = countSyllables(word);
    return syllables >= 3;
  });

  const percentComplexWords = (complexWords.length / words.length) * 100;

  // Calculate score (simplified)
  let score = Math.round(
    206.835 -
    1.015 * avgWordsPerSentence -
    84.6 * (percentComplexWords / 100)
  );

  // Normalize to 0-100
  score = Math.max(0, Math.min(100, score));

  // Check for readability issues
  if (avgWordsPerSentence > 25) {
    issues.push({
      type: 'long_sentences',
      severity: 'low',
      message: 'Sentences are too long on average. Consider breaking them up'
    });
  }

  if (percentComplexWords > 20) {
    issues.push({
      type: 'complex_vocabulary',
      severity: 'low',
      message: 'Article uses complex vocabulary. Consider simpler alternatives'
    });
  }

  return score;
}

/**
 * Count syllables in a word (simplified)
 */
function countSyllables(word: string): number {
  word = word.toLowerCase().replace(/[^a-z]/g, '');
  if (word.length <= 3) return 1;

  word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
  word = word.replace(/^y/, '');
  
  const matches = word.match(/[aeiouy]{1,2}/g);
  return matches ? matches.length : 1;
}

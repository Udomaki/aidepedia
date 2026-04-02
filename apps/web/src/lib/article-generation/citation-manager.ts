/**
 * Citation Manager
 * Handles citation generation, validation, and formatting
 */

export interface Citation {
  source: string;
  title?: string;
  authors?: string[];
  publicationDate?: string;
  url?: string;
  doi?: string;
  citationFormat: 'apa' | 'mla';
  citationText: string;
  qualityScore: number;
  qualityFlags: string[];
}

export interface CitationSource {
  source: string;
  title?: string;
  authors?: string[];
  publicationDate?: string;
  url?: string;
  doi?: string;
}

/**
 * Generate citation from source
 */
export function generateCitation(
  source: CitationSource,
  format: 'apa' | 'mla' = 'apa'
): Citation {
  const citationText = format === 'apa'
    ? formatAPA(source)
    : formatMLA(source);

  const qualityScore = calculateQualityScore(source);
  const qualityFlags = identifyQualityFlags(source);

  return {
    ...source,
    citationFormat: format,
    citationText,
    qualityScore,
    qualityFlags
  };
}

/**
 * Format citation in APA style
 */
function formatAPA(source: CitationSource): string {
  const parts: string[] = [];

  // Authors
  if (source.authors && source.authors.length > 0) {
    if (source.authors.length === 1) {
      parts.push(source.authors[0]);
    } else if (source.authors.length === 2) {
      parts.push(`${source.authors[0]} & ${source.authors[1]}`);
    } else {
      parts.push(`${source.authors[0]} et al.`);
    }
  }

  // Date
  if (source.publicationDate) {
    parts.push(`(${source.publicationDate})`);
  } else {
    parts.push('(n.d.)');
  }

  // Title
  if (source.title) {
    parts.push(source.title);
  }

  // Source/URL
  if (source.url) {
    parts.push(`Retrieved from ${source.url}`);
  } else if (source.source) {
    parts.push(source.source);
  }

  // DOI
  if (source.doi) {
    parts.push(`https://doi.org/${source.doi}`);
  }

  return parts.join('. ') + '.';
}

/**
 * Format citation in MLA style
 */
function formatMLA(source: CitationSource): string {
  const parts: string[] = [];

  // Authors
  if (source.authors && source.authors.length > 0) {
    if (source.authors.length === 1) {
      parts.push(source.authors[0]);
    } else if (source.authors.length === 2) {
      parts.push(`${source.authors[0]}, and ${source.authors[1]}`);
    } else {
      parts.push(`${source.authors[0]}, et al.`);
    }
  }

  // Title
  if (source.title) {
    parts.push(`"${source.title}."`);
  }

  // Source
  if (source.source) {
    parts.push(source.source);
  }

  // Date
  if (source.publicationDate) {
    parts.push(source.publicationDate);
  }

  // URL (for online sources)
  if (source.url) {
    parts.push(source.url);
  }

  // DOI
  if (source.doi) {
    parts.push(`doi:${source.doi}`);
  }

  return parts.join(', ') + '.';
}

/**
 * Calculate quality score for a citation (0-100)
 */
function calculateQualityScore(source: CitationSource): number {
  let score = 0;

  // Has title (+20)
  if (source.title) score += 20;

  // Has authors (+20)
  if (source.authors && source.authors.length > 0) score += 20;

  // Has publication date (+20)
  if (source.publicationDate) score += 20;

  // Has URL or DOI (+20)
  if (source.url || source.doi) score += 20;

  // Has source name (+20)
  if (source.source) score += 20;

  return score;
}

/**
 * Identify quality issues with a citation
 */
function identifyQualityFlags(source: CitationSource): string[] {
  const flags: string[] = [];

  if (!source.authors || source.authors.length === 0) {
    flags.push('missing_author');
  }

  if (!source.publicationDate) {
    flags.push('missing_date');
  }

  if (!source.title) {
    flags.push('missing_title');
  }

  if (!source.url && !source.doi) {
    flags.push('no_link');
  }

  if (!source.source) {
    flags.push('missing_source');
  }

  return flags;
}

/**
 * Validate citation quality
 */
export function validateCitation(citation: Citation): {
  isValid: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  if (citation.qualityScore < 60) {
    issues.push('Citation quality score is too low');
  }

  if (citation.qualityFlags.includes('missing_author')) {
    issues.push('Citation is missing author information');
  }

  if (citation.qualityFlags.includes('missing_title')) {
    issues.push('Citation is missing title');
  }

  if (citation.qualityFlags.includes('missing_source')) {
    issues.push('Citation is missing source');
  }

  return {
    isValid: issues.length === 0,
    issues
  };
}

/**
 * Convert citations to different format
 */
export function convertCitationFormat(
  citation: Citation,
  newFormat: 'apa' | 'mla'
): Citation {
  if (citation.citationFormat === newFormat) {
    return citation;
  }

  return generateCitation(
    {
      source: citation.source,
      title: citation.title,
      authors: citation.authors,
      publicationDate: citation.publicationDate,
      url: citation.url,
      doi: citation.doi
    },
    newFormat
  );
}

/**
 * Extract citations from article content
 * Looks for patterns like [1], [2], etc.
 */
export function extractCitationMarkers(content: string): number[] {
  const matches = content.match(/\[(\d+)\]/g);
  if (!matches) return [];

  const numbers = matches.map(m => parseInt(m.replace(/[\[\]]/g, ''), 10));
  return [...new Set(numbers)].sort((a, b) => a - b);
}

/**
 * Validate that all citations are referenced in content
 */
export function validateCitationReferences(
  content: string,
  citations: Citation[]
): {
  isValid: boolean;
  unreferenced: number[];
  missing: number[];
} {
  const markers = extractCitationMarkers(content);
  const citationNumbers = citations.map((_, index) => index + 1);

  const unreferenced = citationNumbers.filter(num => !markers.includes(num));
  const missing = markers.filter(num => !citationNumbers.includes(num));

  return {
    isValid: unreferenced.length === 0 && missing.length === 0,
    unreferenced,
    missing
  };
}

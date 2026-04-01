/**
 * Calculate reading time for text content
 * Assumes an average reading speed of 200 words per minute
 * @param content - The text content to calculate reading time for
 * @returns Reading time in minutes (minimum 1 minute)
 */
export function calculateReadingTime(content: string): number {
  if (!content || content.trim().length === 0) {
    return 1;
  }

  // Remove markdown syntax, HTML tags, and extra whitespace
  const cleanContent = content
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/[#*_`~\[\]()]/g, '') // Remove markdown syntax
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();

  // Count words (split by whitespace)
  const wordCount = cleanContent.split(/\s+/).filter(word => word.length > 0).length;

  // Calculate reading time (200 words per minute)
  const wordsPerMinute = 200;
  const readingTimeMinutes = Math.ceil(wordCount / wordsPerMinute);

  // Minimum 1 minute
  return Math.max(1, readingTimeMinutes);
}

/**
 * Format reading time for display
 * @param minutes - Reading time in minutes
 * @returns Formatted string (e.g., "5 min read")
 */
export function formatReadingTime(minutes: number): string {
  return `${minutes} min read`;
}

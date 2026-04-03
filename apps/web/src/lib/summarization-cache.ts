/**
 * In-Memory Cache for Article Summaries
 * Provides a simple LRU cache for frequently accessed summaries
 */

interface CacheEntry {
  summary: string;
  keyPoints: string[];
  model: string;
  articleHash: string;
  expiresAt: number;
}

class SummaryCache {
  private cache: Map<string, CacheEntry> = new Map();
  private maxSize: number;
  private ttl: number; // Time to live in milliseconds

  constructor(maxSize = 100, ttlMinutes = 60) {
    this.maxSize = maxSize;
    this.ttl = ttlMinutes * 60 * 1000;
  }

  /**
   * Generate cache key
   */
  private getKey(articleId: number, style: string): string {
    return `${articleId}:${style}`;
  }

  /**
   * Get summary from cache
   */
  get(articleId: number, style: string): CacheEntry | null {
    const key = this.getKey(articleId, style);
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry;
  }

  /**
   * Set summary in cache
   */
  set(articleId: number, style: string, data: Omit<CacheEntry, 'expiresAt'>): void {
    const key = this.getKey(articleId, style);

    // Evict oldest entry if cache is full
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, {
      ...data,
      expiresAt: Date.now() + this.ttl,
    });
  }

  /**
   * Invalidate cache entry for an article
   */
  invalidate(articleId: number): void {
    const keysToDelete: string[] = [];

    for (const key of this.cache.keys()) {
      if (key.startsWith(`${articleId}:`)) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach((key) => this.cache.delete(key));
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      ttl: this.ttl,
    };
  }
}

// Export singleton instance
export const summaryCache = new SummaryCache(100, 60);

// Export class for testing
export { SummaryCache };

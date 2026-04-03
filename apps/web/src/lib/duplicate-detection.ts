/**
 * Duplicate Detection Service
 * Uses MinHash and SimHash algorithms for content fingerprinting and similarity detection
 */

import crypto from 'crypto';

// MinHash configuration
const NUM_HASHES = 128; // Number of hash functions
const SHINGLE_SIZE = 3; // Word n-gram size

/**
 * Generate a MinHash signature for text content
 * MinHash approximates Jaccard similarity between sets
 */
export function generateMinHashSignature(text: string): number[] {
  // Preprocess text
  const words = preprocessText(text);
  
  // Generate shingles (n-grams)
  const shingles = generateShingles(words, SHINGLE_SIZE);
  
  if (shingles.size === 0) {
    return new Array(NUM_HASHES).fill(Infinity);
  }
  
  // Generate hash functions (using random seeds)
  const signature: number[] = [];
  
  for (let i = 0; i < NUM_HASHES; i++) {
    let minHash = Infinity;
    
    // Use deterministic seeds based on index
    const seed = `hash_${i}_${i * 31}`;
    
    for (const shingle of shingles) {
      const hash = hashString(shingle + seed);
      if (hash < minHash) {
        minHash = hash;
      }
    }
    
    signature.push(minHash);
  }
  
  return signature;
}

/**
 * Generate SimHash fingerprint for text content
 * SimHash is efficient for near-duplicate detection
 */
export function generateSimHash(text: string): string {
  const words = preprocessText(text);
  const shingles = generateShingles(words, SHINGLE_SIZE);
  
  // Initialize 64-bit vector
  const v = new Array(64).fill(0);
  
  for (const shingle of shingles) {
    // Hash shingle to 64-bit integer
    const hash = BigInt('0x' + hashString(shingle).toString(16).padStart(16, '0'));
    
    // Update vector based on bit positions
    for (let i = 0; i < 64; i++) {
      const bit = (hash >> BigInt(i)) & BigInt(1);
      v[i] += bit === BigInt(1) ? 1 : -1;
    }
  }
  
  // Generate final fingerprint
  let fingerprint = BigInt(0);
  for (let i = 0; i < 64; i++) {
    if (v[i] > 0) {
      fingerprint |= (BigInt(1) << BigInt(i));
    }
  }
  
  return fingerprint.toString(16).padStart(16, '0');
}

/**
 * Calculate Jaccard similarity using MinHash signatures
 * Returns similarity score between 0 and 100
 */
export function calculateMinHashSimilarity(sig1: number[], sig2: number[]): number {
  if (sig1.length !== sig2.length || sig1.length === 0) {
    return 0;
  }
  
  let matches = 0;
  for (let i = 0; i < sig1.length; i++) {
    if (sig1[i] === sig2[i]) {
      matches++;
    }
  }
  
  return (matches / sig1.length) * 100;
}

/**
 * Calculate Hamming distance between two SimHash fingerprints
 * Returns similarity score between 0 and 100
 */
export function calculateSimHashSimilarity(hash1: string, hash2: string): number {
  if (hash1.length !== hash2.length || hash1.length === 0) {
    return 0;
  }
  
  // Convert hex to BigInt
  const h1 = BigInt('0x' + hash1);
  const h2 = BigInt('0x' + hash2);
  
  // XOR to find differing bits
  const xor = h1 ^ h2;
  
  // Count differing bits (Hamming distance)
  let distance = 0;
  let temp = xor;
  while (temp !== BigInt(0)) {
    distance++;
    temp &= temp - BigInt(1);
  }
  
  // Convert to similarity (0-100)
  const similarity = ((64 - distance) / 64) * 100;
  return Math.max(0, Math.min(100, similarity));
}

/**
 * Calculate overall content similarity using multiple methods
 * Combines MinHash and SimHash for better accuracy
 */
export function calculateSimilarity(
  text1: string,
  text2: string,
  minHashSig1?: number[],
  minHashSig2?: number[],
  simHash1?: string,
  simHash2?: string
): {
  overall: number;
  minHashSimilarity: number;
  simHashSimilarity: number;
  levenshteinSimilarity: number;
} {
  // Generate signatures if not provided
  const sig1 = minHashSig1 || generateMinHashSignature(text1);
  const sig2 = minHashSig2 || generateMinHashSignature(text2);
  const hash1 = simHash1 || generateSimHash(text1);
  const hash2 = simHash2 || generateSimHash(text2);
  
  // Calculate MinHash similarity
  const minHashSim = calculateMinHashSimilarity(sig1, sig2);
  
  // Calculate SimHash similarity
  const simHashSim = calculateSimHashSimilarity(hash1, hash2);
  
  // Calculate Levenshtein similarity for short texts
  const levenshteinSim = calculateLevenshteinSimilarity(text1, text2);
  
  // Weighted average (MinHash 40%, SimHash 40%, Levenshtein 20%)
  const overall = minHashSim * 0.4 + simHashSim * 0.4 + levenshteinSim * 0.2;
  
  return {
    overall: Math.round(overall * 100) / 100,
    minHashSimilarity: Math.round(minHashSim * 100) / 100,
    simHashSimilarity: Math.round(simHashSim * 100) / 100,
    levenshteinSimilarity: Math.round(levenshteinSim * 100) / 100
  };
}

/**
 * Find matching sections between two texts
 */
export function findMatchingSections(
  text1: string,
  text2: string,
  minLength: number = 50
): Array<{ start: number; end: number; text: string }> {
  const matches: Array<{ start: number; end: number; text: string }> = [];
  const words1 = preprocessText(text1);
  const words2 = preprocessText(text2);
  
  // Find common sequences
  const lcs = findLongestCommonSubsequence(words1.join(' '), words2.join(' '));
  
  if (lcs.length >= minLength) {
    // Find position in original text
    const pos = text1.indexOf(lcs);
    if (pos !== -1) {
      matches.push({
        start: pos,
        end: pos + lcs.length,
        text: lcs
      });
    }
  }
  
  return matches;
}

/**
 * Determine match type based on similarity score
 */
export function determineMatchType(similarityScore: number): 'exact' | 'near_duplicate' | 'similar' {
  if (similarityScore >= 95) {
    return 'exact';
  } else if (similarityScore >= 70) {
    return 'near_duplicate';
  } else {
    return 'similar';
  }
}

/**
 * Generate content hash (SHA-256)
 */
export function generateContentHash(text: string): string {
  const normalized = normalizeText(text);
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

// Helper functions

function preprocessText(text: string): string[] {
  return normalizeText(text)
    .toLowerCase()
    .split(/\s+/)
    .filter(word => word.length > 0);
}

function normalizeText(text: string): string {
  return text
    .replace(/[^\w\s]/g, ' ')  // Remove punctuation
    .replace(/\s+/g, ' ')      // Normalize whitespace
    .trim();
}

function generateShingles(words: string[], size: number): Set<string> {
  const shingles = new Set<string>();
  
  for (let i = 0; i <= words.length - size; i++) {
    const shingle = words.slice(i, i + size).join(' ');
    shingles.add(shingle);
  }
  
  return shingles;
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

function calculateLevenshteinSimilarity(text1: string, text2: string): number {
  const len1 = text1.length;
  const len2 = text2.length;
  
  if (len1 === 0 || len2 === 0) {
    return 0;
  }
  
  const distance = levenshteinDistance(text1, text2);
  const maxLen = Math.max(len1, len2);
  
  return ((maxLen - distance) / maxLen) * 100;
}

function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;
  
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(
          dp[i - 1][j],     // deletion
          dp[i][j - 1],     // insertion
          dp[i - 1][j - 1]  // substitution
        );
      }
    }
  }
  
  return dp[m][n];
}

function findLongestCommonSubsequence(str1: string, str2: string): string {
  const m = str1.length;
  const n = str2.length;
  
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  
  // Reconstruct LCS
  let i = m;
  let j = n;
  let lcs = '';
  
  while (i > 0 && j > 0) {
    if (str1[i - 1] === str2[j - 1]) {
      lcs = str1[i - 1] + lcs;
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }
  
  return lcs;
}

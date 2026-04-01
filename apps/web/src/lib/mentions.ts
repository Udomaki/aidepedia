/**
 * Mention parsing utilities for @username mentions
 */

export interface Mention {
  username: string;
  startIndex: number;
  endIndex: number;
}

/**
 * Parse @username mentions from content
 * Supports @username format where username contains alphanumeric characters, underscores, and hyphens
 */
export function parseMentions(content: string): Mention[] {
  const mentions: Mention[] = [];
  // Match @username where username is alphanumeric with underscores and hyphens
  const mentionRegex = /@([a-zA-Z0-9_-]+)/g;
  
  let match;
  while ((match = mentionRegex.exec(content)) !== null) {
    mentions.push({
      username: match[1],
      startIndex: match.index,
      endIndex: match.index + match[0].length,
    });
  }
  
  return mentions;
}

/**
 * Extract unique usernames from mentions
 */
export function extractUniqueUsernames(mentions: Mention[]): string[] {
  const usernames = new Set(mentions.map(m => m.username.toLowerCase()));
  return Array.from(usernames);
}

/**
 * Convert @username mentions to links in HTML content
 */
export function convertMentionsToLinks(content: string, getUserUrl: (username: string) => string): string {
  return content.replace(/@([a-zA-Z0-9_-]+)/g, (match, username) => {
    return `<a href="${getUserUrl(username)}" class="mention-link">@${username}</a>`;
  });
}

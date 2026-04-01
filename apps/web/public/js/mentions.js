/**
 * Mention rendering utilities
 * Converts @username mentions to clickable links
 */

/**
 * Parse content and convert @mentions to links
 * @param content - The text content with @mentions
 * @param baseUrl - The base URL for user profiles (default: /users)
 * @returns HTML string with mentions converted to links
 */
export function renderMentions(content, baseUrl = '/users') {
  if (!content) return content;
  
  // Replace @username with links
  return content.replace(/@([a-zA-Z0-9_-]+)/g, (match, username) => {
    return `<a href="${baseUrl}/${username}" class="mention-link" data-username="${username}">@${username}</a>`;
  });
}

/**
 * Process all mention links to add hover effects and validation
 */
export function enhanceMentionLinks() {
  document.querySelectorAll('.mention-link').forEach(link => {
    // Add hover class
    link.classList.add('hover:underline', 'text-blue-600', 'font-medium');
  });
}

// Auto-enhance on page load if in browser
if (typeof window !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    enhanceMentionLinks();
  });
}

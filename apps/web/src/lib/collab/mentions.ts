/**
 * Mention Handler
 * Handles @mentions in collaborative editing
 */

export interface Mention {
  username: string;
  position: number;
  userId?: string;
}

export interface MentionNotification {
  mentionedUserId: string;
  mentionedByUserId: string;
  articleId: string;
  articleSlug: string;
  articleTitle: string;
  timestamp: number;
}

/**
 * Parse @mentions from text
 */
export function parseMentions(text: string): Mention[] {
  const mentions: Mention[] = [];
  const mentionRegex = /@([a-zA-Z0-9_-]+)/g;
  let match;

  while ((match = mentionRegex.exec(text)) !== null) {
    mentions.push({
      username: match[1],
      position: match.index,
    });
  }

  return mentions;
}

/**
 * Extract unique usernames from mentions
 */
export function extractUniqueUsernames(mentions: Mention[]): string[] {
  const usernames = new Set(mentions.map(m => m.username));
  return Array.from(usernames);
}

/**
 * Create mention element for display
 */
export function createMentionElement(username: string, color?: string): HTMLSpanElement {
  const span = document.createElement('span');
  span.className = 'collab-mention';
  span.style.backgroundColor = color || '#e0f2fe';
  span.style.color = '#0c4a6e';
  span.style.padding = '2px 4px';
  span.style.borderRadius = '3px';
  span.style.fontWeight = '500';
  span.textContent = `@${username}`;
  return span;
}

/**
 * Highlight mentions in text
 */
export function highlightMentions(text: string, color?: string): string {
  return text.replace(/@([a-zA-Z0-9_-]+)/g, (match, username) => {
    return `<span class="collab-mention" style="background-color: ${color || '#e0f2fe'}; color: #0c4a6e; padding: 2px 4px; border-radius: 3px; font-weight: 500;">${match}</span>`;
  });
}

/**
 * Mention suggestion popup
 */
export class MentionSuggest {
  private container: HTMLDivElement | null = null;
  private users: Array<{ id: string; name: string; username: string }> = [];
  private selectedIndex = 0;
  private onSelect: ((user: { id: string; name: string; username: string }) => void) | null = null;

  constructor(users: Array<{ id: string; name: string; username: string }>) {
    this.users = users;
  }

  /**
   * Show suggestion popup
   */
  show(x: number, y: number, query: string, onSelect: (user: any) => void): void {
    this.onSelect = onSelect;
    this.selectedIndex = 0;

    // Filter users by query
    const filtered = this.users.filter(user =>
      user.username.toLowerCase().includes(query.toLowerCase()) ||
      user.name.toLowerCase().includes(query.toLowerCase())
    );

    if (filtered.length === 0) {
      this.hide();
      return;
    }

    // Create container
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.className = 'mention-suggest-popup';
      this.container.style.position = 'absolute';
      this.container.style.zIndex = '1000';
      this.container.style.backgroundColor = 'white';
      this.container.style.border = '1px solid #e5e7eb';
      this.container.style.borderRadius = '6px';
      this.container.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
      this.container.style.maxHeight = '200px';
      this.container.style.overflowY = 'auto';
      document.body.appendChild(this.container);
    }

    // Populate suggestions
    this.container.innerHTML = filtered.map((user, index) => `
      <div class="mention-suggest-item ${index === 0 ? 'selected' : ''}" 
           data-index="${index}"
           style="padding: 8px 12px; cursor: pointer; display: flex; align-items: center; gap: 8px;">
        <div style="width: 24px; height: 24px; border-radius: 50%; background-color: #3b82f6; color: white; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600;">
          ${user.name.charAt(0).toUpperCase()}
        </div>
        <div>
          <div style="font-weight: 500; font-size: 14px;">${user.name}</div>
          <div style="color: #6b7280; font-size: 12px;">@${user.username}</div>
        </div>
      </div>
    `).join('');

    // Position popup
    this.container.style.left = `${x}px`;
    this.container.style.top = `${y}px`;

    // Add click handlers
    this.container.querySelectorAll('.mention-suggest-item').forEach((item, index) => {
      item.addEventListener('click', () => {
        this.selectItem(index);
      });
      
      item.addEventListener('mouseenter', () => {
        this.setSelectedIndex(index);
      });
    });
  }

  /**
   * Hide suggestion popup
   */
  hide(): void {
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
  }

  /**
   * Navigate up in suggestions
   */
  navigateUp(): void {
    if (!this.container) return;
    const items = this.container.querySelectorAll('.mention-suggest-item');
    this.selectedIndex = Math.max(0, this.selectedIndex - 1);
    this.updateSelection();
  }

  /**
   * Navigate down in suggestions
   */
  navigateDown(): void {
    if (!this.container) return;
    const items = this.container.querySelectorAll('.mention-suggest-item');
    this.selectedIndex = Math.min(items.length - 1, this.selectedIndex + 1);
    this.updateSelection();
  }

  /**
   * Select current item
   */
  selectCurrent(): void {
    this.selectItem(this.selectedIndex);
  }

  /**
   * Select item by index
   */
  private selectItem(index: number): void {
    if (!this.container || !this.onSelect) return;

    const items = this.container.querySelectorAll('.mention-suggest-item');
    const item = items[index];
    if (!item) return;

    // Get user data from filtered list
    const filtered = this.users;
    const user = filtered[index];
    
    if (user) {
      this.onSelect(user);
      this.hide();
    }
  }

  /**
   * Set selected index
   */
  private setSelectedIndex(index: number): void {
    this.selectedIndex = index;
    this.updateSelection();
  }

  /**
   * Update selection visual
   */
  private updateSelection(): void {
    if (!this.container) return;

    const items = this.container.querySelectorAll('.mention-suggest-item');
    items.forEach((item, index) => {
      if (index === this.selectedIndex) {
        item.classList.add('selected');
        (item as HTMLElement).style.backgroundColor = '#eff6ff';
      } else {
        item.classList.remove('selected');
        (item as HTMLElement).style.backgroundColor = 'transparent';
      }
    });
  }
}

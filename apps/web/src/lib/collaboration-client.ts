export interface CursorPosition {
  line: number;
  column: number;
}

export interface Collaborator {
  user: {
    id: number;
    name: string | null;
    email: string;
    image: string | null;
  };
  sessionId: string;
  cursorPosition?: CursorPosition;
  currentSection?: string;
  lastActivity: Date;
}

export interface SectionLock {
  sectionName: string;
  userId: number;
  user: {
    id: number;
    name: string | null;
    email: string;
    image: string | null;
  };
  lockedAt: Date;
  expiresAt: Date;
}

export interface EditOperation {
  type: 'insert' | 'delete' | 'replace';
  position: { start: number; end: number };
  oldValue?: string;
  newValue?: string;
  sectionName?: string;
}

export type CollaborationEventType = 
  | 'presence_update'
  | 'edit'
  | 'lock_acquired'
  | 'lock_released'
  | 'conflict_detected';

export interface CollaborationEvent {
  type: CollaborationEventType;
  [key: string]: any;
}

export class CollaborationClient {
  private ws: WebSocket | null = null;
  private sessionId: string | null = null;
  private articleId: string;
  private userId: number;
  private userName: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private eventListeners = new Map<CollaborationEventType, Set<(event: any) => void>>();
  private presenceUpdateInterval: number | null = null;

  constructor(articleId: string, userId: number, userName: string) {
    this.articleId = articleId;
    this.userId = userId;
    this.userName = userName;
  }

  async connect(): Promise<void> {
    // Join session
    const joinResponse = await fetch(`/api/v1/collaboration/${this.articleId}/join`, {
      method: 'POST',
    });
    
    if (!joinResponse.ok) {
      throw new Error('Failed to join collaboration session');
    }
    
    const { sessionId } = await joinResponse.json();
    this.sessionId = sessionId;
    
    // Connect WebSocket
    this.connectWebSocket();
    
    // Start presence updates
    this.startPresenceUpdates();
  }

  private connectWebSocket() {
    const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/api/v1/collaboration/${this.articleId}/ws`;
    
    this.ws = new WebSocket(wsUrl);
    
    this.ws.onopen = () => {
      console.log('Collaboration WebSocket connected');
      this.reconnectAttempts = 0;
    };
    
    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handleEvent(data);
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };
    
    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
    
    this.ws.onclose = () => {
      console.log('WebSocket closed');
      this.attemptReconnect();
    };
  }

  private attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
      
      setTimeout(() => {
        this.connectWebSocket();
      }, this.reconnectDelay * this.reconnectAttempts);
    } else {
      console.error('Max reconnection attempts reached');
      this.emit('connection_failed', { message: 'Failed to reconnect to collaboration server' });
    }
  }

  private startPresenceUpdates() {
    // Update presence every 5 seconds
    this.presenceUpdateInterval = window.setInterval(() => {
      this.updatePresence();
    }, 5000);
  }

  private handleEvent(event: CollaborationEvent) {
    const listeners = this.eventListeners.get(event.type);
    if (listeners) {
      listeners.forEach(callback => callback(event));
    }
  }

  on(eventType: CollaborationEventType, callback: (event: any) => void): void {
    if (!this.eventListeners.has(eventType)) {
      this.eventListeners.set(eventType, new Set());
    }
    this.eventListeners.get(eventType)!.add(callback);
  }

  off(eventType: CollaborationEventType, callback: (event: any) => void): void {
    const listeners = this.eventListeners.get(eventType);
    if (listeners) {
      listeners.delete(callback);
    }
  }

  private emit(eventType: CollaborationEventType, data: any): void {
    this.handleEvent({ type: eventType, ...data });
  }

  async updatePresence(cursorPosition?: CursorPosition, currentSection?: string): Promise<void> {
    if (!this.sessionId) return;
    
    try {
      await fetch(`/api/v1/collaboration/${this.articleId}/presence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: this.sessionId,
          cursorPosition,
          currentSection,
        }),
      });
    } catch (error) {
      console.error('Error updating presence:', error);
    }
  }

  async lockSection(sectionName: string, durationMinutes: number = 5): Promise<{ success: boolean; lock?: SectionLock; error?: string }> {
    if (!this.sessionId) {
      return { success: false, error: 'No active session' };
    }
    
    try {
      const response = await fetch(`/api/v1/collaboration/${this.articleId}/lock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sectionName,
          sessionId: this.sessionId,
          durationMinutes,
        }),
      });
      
      const result = await response.json();
      
      if (result.success && this.ws) {
        this.ws.send(JSON.stringify({
          type: 'lock_acquired',
          sectionName,
          userId: this.userId,
          userName: this.userName,
        }));
      }
      
      return result;
    } catch (error) {
      console.error('Error locking section:', error);
      return { success: false, error: 'Failed to lock section' };
    }
  }

  async unlockSection(sectionName: string): Promise<void> {
    if (!this.sessionId) return;
    
    try {
      await fetch(`/api/v1/collaboration/${this.articleId}/lock`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sectionName,
          sessionId: this.sessionId,
        }),
      });
      
      if (this.ws) {
        this.ws.send(JSON.stringify({
          type: 'lock_released',
          sectionName,
          userId: this.userId,
          userName: this.userName,
        }));
      }
    } catch (error) {
      console.error('Error unlocking section:', error);
    }
  }

  async getActiveCollaborators(): Promise<Collaborator[]> {
    try {
      const response = await fetch(`/api/v1/collaboration/${this.articleId}/presence`);
      const { collaborators } = await response.json();
      return collaborators;
    } catch (error) {
      console.error('Error fetching collaborators:', error);
      return [];
    }
  }

  async getActiveLocks(): Promise<SectionLock[]> {
    try {
      const response = await fetch(`/api/v1/collaboration/${this.articleId}/lock`);
      const { locks } = await response.json();
      return locks;
    } catch (error) {
      console.error('Error fetching locks:', error);
      return [];
    }
  }

  async getHistory(limit: number = 50, userId?: number): Promise<any[]> {
    try {
      const params = new URLSearchParams({ limit: limit.toString() });
      if (userId) {
        params.append('userId', userId.toString());
      }
      
      const response = await fetch(`/api/v1/collaboration/${this.articleId}/history?${params}`);
      const { history } = await response.json();
      return history;
    } catch (error) {
      console.error('Error fetching history:', error);
      return [];
    }
  }

  broadcastEdit(operation: EditOperation): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'edit',
        userId: this.userId,
        userName: this.userName,
        operation,
      }));
    }
  }

  async disconnect(): Promise<void> {
    // Stop presence updates
    if (this.presenceUpdateInterval) {
      clearInterval(this.presenceUpdateInterval);
    }
    
    // Close WebSocket
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    // Leave session
    if (this.sessionId) {
      // The leaveSession API would be called here
      // For now, we'll just clear the session
      this.sessionId = null;
    }
  }
}

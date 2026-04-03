import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import type { 
  CollabUser, 
  CursorPosition, 
  SelectionRange, 
  CollaborationConfig,
  CollabState 
} from './types';
import { USER_COLORS } from './types';
import { OfflineManager } from './offline-manager';

/**
 * CollaborationManager
 * Manages real-time collaborative editing using Yjs CRDT
 */
export class CollaborationManager {
  private doc: Y.Doc;
  private provider: WebsocketProvider | null = null;
  private awareness: any;
  private config: CollaborationConfig;
  private state: CollabState;
  private onStateChange?: (state: CollabState) => void;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private offlineManager: OfflineManager;
  private connectionAttempts: number = 0;
  private maxConnectionAttempts: number = 3;

  constructor(config: CollaborationConfig) {
    this.config = config;
    this.doc = new Y.Doc();
    this.state = {
      connected: false,
      sessionId: null,
      users: [],
      localUser: this.createLocalUser(),
    };
    this.offlineManager = new OfflineManager(this.doc, config.articleSlug);
  }

  /**
   * Initialize collaboration session
   */
  async connect(): Promise<void> {
    const wsUrl = this.config.wsUrl || this.getDefaultWsUrl();
    
    try {
      this.connectionAttempts++;
      
      // Create WebSocket provider
      this.provider = new WebsocketProvider(
        wsUrl,
        `article-${this.config.articleSlug}`,
        this.doc,
        { connect: true }
      );

      this.awareness = this.provider.awareness;

      // Set local user state
      this.awareness.setLocalStateField('user', this.state.localUser);

      // Listen for connection changes
      this.provider.on('status', (event: { status: string }) => {
        this.state.connected = event.status === 'connected';
        this.notifyStateChange();

        if (this.state.connected) {
          this.connectionAttempts = 0;
          // Replay offline changes
          this.replayOfflineQueue();
        }
      });

      // Listen for awareness changes (other users)
      this.awareness.on('change', () => {
        this.updateUsers();
      });

      // Handle offline changes
      this.doc.on('update', (update: Uint8Array) => {
        if (!this.state.connected) {
          this.offlineManager.queueOperation(update);
        }
      });

    } catch (error) {
      console.error('Failed to connect to collaboration server:', error);
      
      // Retry connection after delay if we haven't exceeded max attempts
      if (this.connectionAttempts < this.maxConnectionAttempts) {
        this.scheduleReconnect();
      } else {
        console.warn('Max connection attempts reached, operating in offline mode');
        // Still notify that we're ready (in offline mode)
        this.state.connected = false;
        this.notifyStateChange();
      }
    }
  }

  /**
   * Disconnect from collaboration session
   */
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.provider) {
      this.provider.disconnect();
      this.provider.destroy();
      this.provider = null;
    }

    this.state.connected = false;
    this.notifyStateChange();
  }

  /**
   * Get Y.Text instance for content
   */
  getText(name: string = 'content'): Y.Text {
    return this.doc.getText(name);
  }

  /**
   * Update cursor position
   */
  updateCursor(position: CursorPosition): void {
    if (!this.awareness) return;

    const user = this.state.localUser;
    if (user) {
      user.cursor = position;
      user.lastActive = Date.now();
      user.status = 'editing';
      this.awareness.setLocalStateField('user', user);
    }
  }

  /**
   * Update selection range
   */
  updateSelection(selection: SelectionRange | null): void {
    if (!this.awareness) return;

    const user = this.state.localUser;
    if (user) {
      user.selection = selection || undefined;
      user.lastActive = Date.now();
      this.awareness.setLocalStateField('user', user);
    }
  }

  /**
   * Update user status
   */
  updateStatus(status: 'viewing' | 'editing' | 'idle'): void {
    if (!this.awareness) return;

    const user = this.state.localUser;
    if (user) {
      user.status = status;
      user.lastActive = Date.now();
      this.awareness.setLocalStateField('user', user);
    }
  }

  /**
   * Get current state
   */
  getState(): CollabState {
    return { ...this.state };
  }

  /**
   * Set state change callback
   */
  onStateUpdate(callback: (state: CollabState) => void): void {
    this.onStateChange = callback;
  }

  /**
   * Create local user object
   */
  private createLocalUser(): CollabUser {
    const colorIndex = Math.floor(Math.random() * USER_COLORS.length);
    return {
      id: this.config.userId,
      name: this.config.userName,
      email: this.config.userEmail,
      avatar: this.config.userAvatar,
      color: USER_COLORS[colorIndex],
      status: 'viewing',
      lastActive: Date.now(),
    };
  }

  /**
   * Update users list from awareness
   */
  private updateUsers(): void {
    if (!this.awareness) return;

    const users: CollabUser[] = [];
    const states = this.awareness.getStates();

    states.forEach((state: any, clientId: number) => {
      if (state.user && state.user.id !== this.config.userId) {
        users.push(state.user);
      }
    });

    this.state.users = users;
    this.notifyStateChange();
  }

  /**
   * Notify state change
   */
  private notifyStateChange(): void {
    if (this.onStateChange) {
      this.onStateChange(this.getState());
    }
  }

  /**
   * Get default WebSocket URL
   */
  private getDefaultWsUrl(): string {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/api/v1/collab`;
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 5000);
  }

  /**
   * Replay offline queue
   */
  private replayOfflineQueue(): void {
    if (!this.offlineManager.hasQueuedOperations()) return;
    
    const mergedUpdate = this.offlineManager.getMergedUpdate();
    if (mergedUpdate) {
      Y.applyUpdate(this.doc, mergedUpdate);
      this.offlineManager.clearQueue();
    }
  }
}

// Singleton instance per article
const managers = new Map<string, CollaborationManager>();

export function getCollaborationManager(config: CollaborationConfig): CollaborationManager {
  const key = config.articleSlug;
  
  if (!managers.has(key)) {
    managers.set(key, new CollaborationManager(config));
  }

  return managers.get(key)!;
}

export function closeCollaborationManager(articleSlug: string): void {
  const manager = managers.get(articleSlug);
  if (manager) {
    manager.disconnect();
    managers.delete(articleSlug);
  }
}

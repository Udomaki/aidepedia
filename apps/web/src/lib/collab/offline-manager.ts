/**
 * Offline Manager
 * Handles offline queue and synchronization for collaborative editing
 */

import * as Y from 'yjs';

interface QueuedOperation {
  update: Uint8Array;
  timestamp: number;
}

export class OfflineManager {
  private doc: Y.Doc;
  private queue: QueuedOperation[];
  private maxQueueSize: number;
  private storageKey: string;

  constructor(doc: Y.Doc, articleSlug: string, maxQueueSize: number = 100) {
    this.doc = doc;
    this.queue = [];
    this.maxQueueSize = maxQueueSize;
    this.storageKey = `collab-offline-${articleSlug}`;
    this.loadFromStorage();
  }

  /**
   * Add operation to offline queue
   */
  queueOperation(update: Uint8Array): void {
    // Don't queue if already at max size
    if (this.queue.length >= this.maxQueueSize) {
      console.warn('Offline queue is full, oldest operations will be lost');
      this.queue.shift();
    }

    this.queue.push({
      update,
      timestamp: Date.now(),
    });

    this.saveToStorage();
  }

  /**
   * Get all queued operations
   */
  getQueuedOperations(): QueuedOperation[] {
    return [...this.queue];
  }

  /**
   * Clear the queue
   */
  clearQueue(): void {
    this.queue = [];
    this.clearStorage();
  }

  /**
   * Check if there are queued operations
   */
  hasQueuedOperations(): boolean {
    return this.queue.length > 0;
  }

  /**
   * Get queue size
   */
  getQueueSize(): number {
    return this.queue.length;
  }

  /**
   * Merge all queued operations into a single update
   */
  getMergedUpdate(): Uint8Array | null {
    if (this.queue.length === 0) return null;

    // Create a temporary document to merge all updates
    const tempDoc = new Y.Doc();
    
    this.queue.forEach(({ update }) => {
      Y.applyUpdate(tempDoc, update);
    });

    return Y.encodeStateAsUpdate(tempDoc);
  }

  /**
   * Save queue to localStorage
   */
  private saveToStorage(): void {
    if (typeof window === 'undefined') return;

    try {
      const data = this.queue.map(({ update, timestamp }) => ({
        update: Array.from(update),
        timestamp,
      }));
      
      localStorage.setItem(this.storageKey, JSON.stringify(data));
    } catch (error) {
      console.error('Failed to save offline queue to storage:', error);
    }
  }

  /**
   * Load queue from localStorage
   */
  private loadFromStorage(): void {
    if (typeof window === 'undefined') return;

    try {
      const stored = localStorage.getItem(this.storageKey);
      if (!stored) return;

      const data = JSON.parse(stored);
      this.queue = data.map(({ update, timestamp }: any) => ({
        update: new Uint8Array(update),
        timestamp,
      }));
    } catch (error) {
      console.error('Failed to load offline queue from storage:', error);
      this.queue = [];
    }
  }

  /**
   * Clear storage
   */
  private clearStorage(): void {
    if (typeof window === 'undefined') return;

    try {
      localStorage.removeItem(this.storageKey);
    } catch (error) {
      console.error('Failed to clear offline queue from storage:', error);
    }
  }
}

/**
 * Network status manager
 * Monitors online/offline status and triggers sync when back online
 */
export class NetworkManager {
  private isOnline: boolean;
  private listeners: Set<(online: boolean) => void>;

  constructor() {
    this.isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    this.listeners = new Set();
    this.init();
  }

  private init(): void {
    if (typeof window === 'undefined') return;

    window.addEventListener('online', () => {
      this.isOnline = true;
      this.notifyListeners(true);
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      this.notifyListeners(false);
    });
  }

  /**
   * Check if online
   */
  getStatus(): boolean {
    return this.isOnline;
  }

  /**
   * Subscribe to network status changes
   */
  subscribe(callback: (online: boolean) => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * Notify all listeners
   */
  private notifyListeners(online: boolean): void {
    this.listeners.forEach(callback => callback(online));
  }
}

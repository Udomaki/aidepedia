/**
 * Event Bus
 * OC-109: Plugin event system for inter-plugin communication
 */

export interface EventListener {
  id: string;
  event: string;
  handler: Function;
  once: boolean;
}

export interface EventContext {
  event: string;
  data: any;
  timestamp: Date;
  cancelled: boolean;
}

export class EventBus {
  private listeners: Map<string, EventListener[]> = new Map();
  private listenerIdCounter = 0;
  private eventHistory: EventContext[] = [];
  private maxHistorySize = 100;

  /**
   * Subscribe to an event
   */
  on(event: string, handler: Function): string {
    return this.addListener(event, handler, false);
  }

  /**
   * Subscribe to an event once
   */
  once(event: string, handler: Function): string {
    return this.addListener(event, handler, true);
  }

  /**
   * Add event listener
   */
  private addListener(event: string, handler: Function, once: boolean): string {
    const listenerId = `listener-${++this.listenerIdCounter}`;
    
    const listener: EventListener = {
      id: listenerId,
      event,
      handler,
      once
    };
    
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    
    this.listeners.get(event)!.push(listener);
    
    return listenerId;
  }

  /**
   * Unsubscribe from an event
   */
  off(event: string, handler: Function): void {
    const listeners = this.listeners.get(event);
    
    if (listeners) {
      const index = listeners.findIndex(l => l.handler === handler);
      
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    }
  }

  /**
   * Remove listener by ID
   */
  removeListener(listenerId: string): void {
    for (const [event, listeners] of this.listeners.entries()) {
      const index = listeners.findIndex(l => l.id === listenerId);
      
      if (index !== -1) {
        listeners.splice(index, 1);
        break;
      }
    }
  }

  /**
   * Emit an event
   */
  async emit(event: string, data: any): Promise<void> {
    const context: EventContext = {
      event,
      data,
      timestamp: new Date(),
      cancelled: false
    };
    
    // Add to history
    this.addToHistory(context);
    
    const listeners = this.listeners.get(event) || [];
    const onceListeners: EventListener[] = [];
    
    // Execute all listeners
    for (const listener of listeners) {
      if (context.cancelled) {
        break;
      }
      
      try {
        await listener.handler(context);
        
        // Mark for removal if once
        if (listener.once) {
          onceListeners.push(listener);
        }
      } catch (error) {
        console.error(`Error in event listener ${listener.id}:`, error);
      }
    }
    
    // Remove once listeners
    for (const listener of onceListeners) {
      const index = listeners.indexOf(listener);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    }
  }

  /**
   * Emit event synchronously
   */
  emitSync(event: string, data: any): void {
    const context: EventContext = {
      event,
      data,
      timestamp: new Date(),
      cancelled: false
    };
    
    // Add to history
    this.addToHistory(context);
    
    const listeners = this.listeners.get(event) || [];
    const onceListeners: EventListener[] = [];
    
    for (const listener of listeners) {
      if (context.cancelled) {
        break;
      }
      
      try {
        listener.handler(context);
        
        if (listener.once) {
          onceListeners.push(listener);
        }
      } catch (error) {
        console.error(`Error in event listener ${listener.id}:`, error);
      }
    }
    
    // Remove once listeners
    for (const listener of onceListeners) {
      const index = listeners.indexOf(listener);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    }
  }

  /**
   * Cancel current event propagation
   */
  cancel(context: EventContext): void {
    context.cancelled = true;
  }

  /**
   * Add event to history
   */
  private addToHistory(context: EventContext): void {
    this.eventHistory.push(context);
    
    // Trim history if needed
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }
  }

  /**
   * Get event history
   */
  getHistory(event?: string): EventContext[] {
    if (event) {
      return this.eventHistory.filter(ctx => ctx.event === event);
    }
    return [...this.eventHistory];
  }

  /**
   * Clear event history
   */
  clearHistory(): void {
    this.eventHistory = [];
  }

  /**
   * Get all registered events
   */
  getEvents(): string[] {
    return Array.from(this.listeners.keys());
  }

  /**
   * Get listener count for an event
   */
  getListenerCount(event: string): number {
    return this.listeners.get(event)?.length || 0;
  }

  /**
   * Clear all listeners
   */
  clear(): void {
    this.listeners.clear();
  }
}

// Predefined events
export const PluginEvents = {
  // Plugin lifecycle
  PLUGIN_INSTALLED: 'plugin:installed',
  PLUGIN_ACTIVATED: 'plugin:activated',
  PLUGIN_DEACTIVATED: 'plugin:deactivated',
  PLUGIN_UNINSTALLED: 'plugin:uninstalled',
  PLUGIN_UPDATED: 'plugin:updated',
  PLUGIN_ERROR: 'plugin:error',
  
  // Article events
  ARTICLE_CREATED: 'article:created',
  ARTICLE_UPDATED: 'article:updated',
  ARTICLE_DELETED: 'article:deleted',
  ARTICLE_PUBLISHED: 'article:published',
  ARTICLE_VIEWED: 'article:viewed',
  
  // User events
  USER_LOGGED_IN: 'user:logged:in',
  USER_LOGGED_OUT: 'user:logged:out',
  USER_UPDATED: 'user:updated',
  
  // Comment events
  COMMENT_CREATED: 'comment:created',
  COMMENT_UPDATED: 'comment:updated',
  COMMENT_DELETED: 'comment:deleted',
  
  // System events
  SYSTEM_STARTUP: 'system:startup',
  SYSTEM_SHUTDOWN: 'system:shutdown',
  SYSTEM_ERROR: 'system:error'
} as const;

export const eventBus = new EventBus();

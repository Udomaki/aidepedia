/**
 * Hook System
 * OC-109: Plugin hook registration and execution
 */

export interface Hook {
  id: string;
  pluginId: string;
  event: string;
  handler: Function;
  priority: number;
}

export interface HookContext {
  event: string;
  data: any;
  pluginId?: string;
  timestamp: Date;
}

export class HookSystem {
  private hooks: Map<string, Hook[]> = new Map();
  private hookIdCounter = 0;

  /**
   * Register a hook for an event
   */
  register(pluginId: string, event: string, handler: Function, priority: number = 10): string {
    const hookId = `hook-${++this.hookIdCounter}`;
    
    const hook: Hook = {
      id: hookId,
      pluginId,
      event,
      handler,
      priority
    };
    
    if (!this.hooks.has(event)) {
      this.hooks.set(event, []);
    }
    
    const hooks = this.hooks.get(event)!;
    hooks.push(hook);
    
    // Sort by priority (lower = higher priority)
    hooks.sort((a, b) => a.priority - b.priority);
    
    return hookId;
  }

  /**
   * Unregister a specific hook
   */
  unregister(pluginId: string, event: string, handler: Function): void {
    const hooks = this.hooks.get(event);
    
    if (hooks) {
      const index = hooks.findIndex(
        h => h.pluginId === pluginId && h.handler === handler
      );
      
      if (index !== -1) {
        hooks.splice(index, 1);
      }
    }
  }

  /**
   * Unregister all hooks for a plugin
   */
  unregisterAll(pluginId: string): void {
    for (const [event, hooks] of this.hooks.entries()) {
      const filtered = hooks.filter(h => h.pluginId !== pluginId);
      this.hooks.set(event, filtered);
    }
  }

  /**
   * Execute hooks for an event
   */
  async execute<T = any>(event: string, data: T): Promise<T> {
    const hooks = this.hooks.get(event) || [];
    
    let result = data;
    
    for (const hook of hooks) {
      try {
        const context: HookContext = {
          event,
          data: result,
          pluginId: hook.pluginId,
          timestamp: new Date()
        };
        
        const hookResult = await hook.handler(context);
        
        // If handler returns a value, use it as new result
        if (hookResult !== undefined) {
          result = hookResult;
        }
      } catch (error) {
        console.error(`Error executing hook ${hook.id} for event ${event}:`, error);
        // Continue with other hooks even if one fails
      }
    }
    
    return result;
  }

  /**
   * Execute hooks in parallel
   */
  async executeParallel<T = any>(event: string, data: T): Promise<T> {
    const hooks = this.hooks.get(event) || [];
    
    if (hooks.length === 0) {
      return data;
    }
    
    const context: HookContext = {
      event,
      data,
      timestamp: new Date()
    };
    
    const results = await Promise.allSettled(
      hooks.map(async hook => {
        try {
          return await hook.handler({ ...context, pluginId: hook.pluginId });
        } catch (error) {
          console.error(`Error executing hook ${hook.id}:`, error);
          return undefined;
        }
      })
    );
    
    // Return the last successful result
    for (let i = results.length - 1; i >= 0; i--) {
      const result = results[i];
      if (result.status === 'fulfilled' && result.value !== undefined) {
        return result.value;
      }
    }
    
    return data;
  }

  /**
   * Check if event has registered hooks
   */
  hasHooks(event: string): boolean {
    const hooks = this.hooks.get(event);
    return hooks !== undefined && hooks.length > 0;
  }

  /**
   * Get all hooks for an event
   */
  getHooks(event: string): Hook[] {
    return this.hooks.get(event) || [];
  }

  /**
   * Get all registered events
   */
  getEvents(): string[] {
    return Array.from(this.hooks.keys());
  }

  /**
   * Clear all hooks
   */
  clear(): void {
    this.hooks.clear();
  }
}

// Predefined hook events
export const HookEvents = {
  // Article events
  ARTICLE_BEFORE_CREATE: 'article:before:create',
  ARTICLE_AFTER_CREATE: 'article:after:create',
  ARTICLE_BEFORE_UPDATE: 'article:before:update',
  ARTICLE_AFTER_UPDATE: 'article:after:update',
  ARTICLE_BEFORE_DELETE: 'article:before:delete',
  ARTICLE_AFTER_DELETE: 'article:after:delete',
  ARTICLE_BEFORE_PUBLISH: 'article:before:publish',
  ARTICLE_AFTER_PUBLISH: 'article:after:publish',
  
  // Editor events
  EDITOR_BEFORE_SAVE: 'editor:before:save',
  EDITOR_AFTER_SAVE: 'editor:after:save',
  EDITOR_RENDER_TOOLBAR: 'editor:render:toolbar',
  EDITOR_RENDER_SIDEBAR: 'editor:render:sidebar',
  
  // User events
  USER_BEFORE_LOGIN: 'user:before:login',
  USER_AFTER_LOGIN: 'user:after:login',
  USER_BEFORE_LOGOUT: 'user:before:logout',
  USER_AFTER_LOGOUT: 'user:after:logout',
  
  // Comment events
  COMMENT_BEFORE_CREATE: 'comment:before:create',
  COMMENT_AFTER_CREATE: 'comment:after:create',
  
  // Plugin events
  PLUGIN_BEFORE_ACTIVATE: 'plugin:before:activate',
  PLUGIN_AFTER_ACTIVATE: 'plugin:after:activate',
  PLUGIN_BEFORE_DEACTIVATE: 'plugin:before:deactivate',
  PLUGIN_AFTER_DEACTIVATE: 'plugin:after:deactivate',
  
  // UI events
  UI_SIDEBAR_RENDER: 'ui:sidebar:render',
  UI_SETTINGS_RENDER: 'ui:settings:render',
  UI_COMMAND_REGISTER: 'ui:command:register'
} as const;

export const hookSystem = new HookSystem();

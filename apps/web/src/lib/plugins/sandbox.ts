/**
 * Plugin Sandbox
 * OC-109: Secure plugin execution environment
 */

import type { Plugin, PluginPermission, PluginContext } from './types';

export interface SandboxConfig {
  timeout: number;
  memoryLimit: number;
  rateLimits: Map<string, RateLimit>;
}

export interface RateLimit {
  windowMs: number;
  maxRequests: number;
  requests: number[];
}

export class PluginSandbox {
  private config: SandboxConfig;
  private rateLimitStore: Map<string, RateLimit> = new Map();

  constructor(config?: Partial<SandboxConfig>) {
    this.config = {
      timeout: 5000, // 5 seconds
      memoryLimit: 50 * 1024 * 1024, // 50MB
      rateLimits: new Map([
        ['default', { windowMs: 60000, maxRequests: 100, requests: [] }],
        ['data:read', { windowMs: 60000, maxRequests: 200, requests: [] }],
        ['data:write', { windowMs: 60000, maxRequests: 50, requests: [] }]
      ]),
      ...config
    };
  }

  /**
   * Create a sandboxed module
   */
  async createSandboxedModule(moduleUrl: string, plugin: Plugin): Promise<string> {
    // In a real implementation, this would:
    // 1. Fetch the module code
    // 2. Wrap it in a sandbox
    // 3. Inject only allowed APIs
    // 4. Apply CSP and other security measures
    
    const sandboxWrapper = `
      (function() {
        'use strict';
        
        // Sandbox globals
        const __plugin = ${JSON.stringify(plugin)};
        const __allowedPermissions = ${JSON.stringify(plugin.permissions)};
        
        // Restricted globals
        const window = undefined;
        const document = undefined;
        const globalThis = undefined;
        const process = undefined;
        const require = undefined;
        const eval = undefined;
        const Function = undefined;
        
        // Plugin code would be injected here
        // This is a simplified version
        
        return {
          activate: async function(context) {
            // Plugin activation logic
            console.log('[${plugin.name}] Activating plugin');
          },
          deactivate: async function() {
            // Plugin deactivation logic
            console.log('[${plugin.name}] Deactivating plugin');
          }
        };
      })();
    `;
    
    return sandboxWrapper;
  }

  /**
   * Execute code in sandbox
   */
  async execute(code: string, context: PluginContext): Promise<any> {
    return new Promise((resolve, reject) => {
      // Set timeout
      const timeout = setTimeout(() => {
        reject(new Error('Plugin execution timeout'));
      }, this.config.timeout);
      
      try {
        // In a real implementation, this would use:
        // - Web Workers for isolation
        // - iframe with CSP
        // - Node.js vm module (server-side)
        // - Deno sandboxing
        
        // For now, we'll use a simplified approach
        const result = this.executeInSandbox(code, context);
        
        clearTimeout(timeout);
        resolve(result);
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  /**
   * Execute in sandbox (simplified)
   */
  private executeInSandbox(code: string, context: PluginContext): any {
    // This is a simplified sandbox
    // In production, use proper sandboxing mechanisms
    
    try {
      // Create isolated function with restricted scope
      const sandboxedFunction = new Function('context', `
        'use strict';
        ${code}
      `);
      
      return sandboxedFunction(context);
    } catch (error) {
      throw new Error(`Sandbox execution failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Validate plugin permissions
   */
  validatePermissions(plugin: Plugin, permission: PluginPermission): boolean {
    if (plugin.permissions.includes('admin')) {
      // Admin permission grants all access
      return true;
    }
    
    // Check specific permission
    const hasPermission = plugin.permissions.includes(permission);
    
    if (!hasPermission) {
      throw new Error(`Plugin ${plugin.id} does not have permission: ${permission}`);
    }
    
    return true;
  }

  /**
   * Apply rate limiting
   */
  applyRateLimit(pluginId: string, action: string): boolean {
    const key = `${pluginId}:${action}`;
    const limitKey = this.getRateLimitKey(action);
    const limit = this.config.rateLimits.get(limitKey) || this.config.rateLimits.get('default')!;
    
    const now = Date.now();
    let rateLimit = this.rateLimitStore.get(key);
    
    if (!rateLimit) {
      rateLimit = {
        windowMs: limit.windowMs,
        maxRequests: limit.maxRequests,
        requests: []
      };
      this.rateLimitStore.set(key, rateLimit);
    }
    
    // Clean old requests
    rateLimit.requests = rateLimit.requests.filter(
      timestamp => now - timestamp < rateLimit!.windowMs
    );
    
    // Check limit
    if (rateLimit.requests.length >= rateLimit.maxRequests) {
      throw new Error(`Rate limit exceeded for ${action}`);
    }
    
    // Record request
    rateLimit.requests.push(now);
    
    return true;
  }

  /**
   * Get rate limit key for action
   */
  private getRateLimitKey(action: string): string {
    if (action.startsWith('read')) {
      return 'data:read';
    }
    if (action.startsWith('write')) {
      return 'data:write';
    }
    return 'default';
  }

  /**
   * Check if action is within rate limit
   */
  isWithinLimit(pluginId: string, action: string): boolean {
    try {
      return this.applyRateLimit(pluginId, action);
    } catch {
      return false;
    }
  }

  /**
   * Clear rate limits for a plugin
   */
  clearRateLimits(pluginId: string): void {
    for (const key of this.rateLimitStore.keys()) {
      if (key.startsWith(pluginId)) {
        this.rateLimitStore.delete(key);
      }
    }
  }

  /**
   * Get rate limit status
   */
  getRateLimitStatus(pluginId: string, action: string): {
    remaining: number;
    resetAt: Date;
  } {
    const key = `${pluginId}:${action}`;
    const rateLimit = this.rateLimitStore.get(key);
    
    if (!rateLimit || rateLimit.requests.length === 0) {
      return {
        remaining: this.config.rateLimits.get('default')!.maxRequests,
        resetAt: new Date(Date.now() + 60000)
      };
    }
    
    const oldestRequest = Math.min(...rateLimit.requests);
    const resetAt = new Date(oldestRequest + rateLimit.windowMs);
    const remaining = Math.max(0, rateLimit.maxRequests - rateLimit.requests.length);
    
    return { remaining, resetAt };
  }

  /**
   * Validate code for dangerous patterns
   */
  validateCode(code: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    // Check for dangerous patterns
    const dangerousPatterns = [
      /eval\s*\(/,
      /Function\s*\(/,
      /require\s*\(/,
      /import\s+/,
      /process\s*\./,
      /globalThis/,
      /window\s*\./,
      /document\s*\./,
      /__proto__/,
      /prototype\s*\[/
    ];
    
    for (const pattern of dangerousPatterns) {
      if (pattern.test(code)) {
        errors.push(`Dangerous pattern detected: ${pattern.source}`);
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
}

export const pluginSandbox = new PluginSandbox();

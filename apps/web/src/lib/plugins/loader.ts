/**
 * Plugin Loader with Sandboxing
 * OC-109: Secure plugin loading and lifecycle management
 */

import type { Plugin, PluginManifest, PluginInstance, PluginContext, PluginPermission } from './types.js';
import { EventBus } from './event-bus.js';
import { HookSystem } from './hooks.js';
import { PluginSandbox } from './sandbox.js';
import { PluginAudit } from './audit.js';

export class PluginLoader {
  private plugins: Map<string, Plugin> = new Map();
  private instances: Map<string, PluginInstance> = new Map();
  private eventBus: EventBus;
  private hooks: HookSystem;
  private sandbox: PluginSandbox;
  private audit: PluginAudit;
  private pluginDir: string;

  constructor(pluginDir: string = './plugins') {
    this.pluginDir = pluginDir;
    this.eventBus = new EventBus();
    this.hooks = new HookSystem();
    this.sandbox = new PluginSandbox();
    this.audit = new PluginAudit();
  }

  /**
   * Load and validate plugin manifest
   */
  async loadManifest(pluginPath: string): Promise<PluginManifest> {
    try {
      const manifestPath = `${pluginPath}/plugin.json`;
      const response = await fetch(manifestPath);
      
      if (!response.ok) {
        throw new Error(`Plugin manifest not found at ${manifestPath}`);
      }
      
      const manifest: PluginManifest = await response.json();
      
      // Validate manifest
      this.validateManifest(manifest);
      
      return manifest;
    } catch (error) {
      throw new Error(`Failed to load plugin manifest: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Validate plugin manifest schema
   */
  private validateManifest(manifest: PluginManifest): void {
    const required = ['id', 'name', 'version', 'description', 'author', 'license', 'main', 'permissions', 'engines'];
    
    for (const field of required) {
      if (!(field in manifest)) {
        throw new Error(`Invalid manifest: missing required field "${field}"`);
      }
    }
    
    // Validate version format
    if (!this.isValidVersion(manifest.version)) {
      throw new Error(`Invalid version format: ${manifest.version}`);
    }
    
    // Validate permissions
    const validPermissions: PluginPermission[] = [
      'read:articles', 'write:articles', 'read:users', 'write:users',
      'read:comments', 'write:comments', 'admin', 'network', 'storage'
    ];
    
    for (const perm of manifest.permissions) {
      if (!validPermissions.includes(perm)) {
        throw new Error(`Invalid permission: ${perm}`);
      }
    }
    
    // Validate engine compatibility
    if (!manifest.engines.aidepedia) {
      throw new Error('Missing engine compatibility declaration');
    }
  }

  /**
   * Validate semver version
   */
  private isValidVersion(version: string): boolean {
    return /^\d+\.\d+\.\d+(-[\w\d]+)?$/.test(version);
  }

  /**
   * Install a plugin
   */
  async install(pluginPath: string): Promise<Plugin> {
    const manifest = await this.loadManifest(pluginPath);
    
    // Check if already installed
    if (this.plugins.has(manifest.id)) {
      throw new Error(`Plugin ${manifest.id} is already installed`);
    }
    
    const plugin: Plugin = {
      ...manifest,
      installed: true,
      active: false,
      enabled: false,
      path: pluginPath,
      installedAt: new Date()
    };
    
    this.plugins.set(manifest.id, plugin);
    
    await this.audit.log({
      pluginId: manifest.id,
      action: 'install',
      details: { version: manifest.version },
      success: true
    });
    
    return plugin;
  }

  /**
   * Activate a plugin
   */
  async activate(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    
    if (!plugin) {
      throw new Error(`Plugin ${pluginId} not found`);
    }
    
    if (plugin.active) {
      throw new Error(`Plugin ${pluginId} is already active`);
    }
    
    try {
      // Load plugin instance
      const instance = await this.loadPluginInstance(plugin);
      this.instances.set(pluginId, instance);
      
      // Create plugin context
      const context = this.createPluginContext(plugin);
      
      // Activate plugin
      await instance.activate(context);
      
      // Update plugin state
      plugin.active = true;
      plugin.enabled = true;
      plugin.activatedAt = new Date();
      plugin.instance = instance;
      
      await this.audit.log({
        pluginId,
        action: 'activate',
        success: true
      });
      
      // Emit activation event
      this.eventBus.emit('plugin:activated', { pluginId });
      
    } catch (error) {
      await this.audit.log({
        pluginId,
        action: 'activate',
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
      
      throw error;
    }
  }

  /**
   * Load plugin instance with sandboxing
   */
  private async loadPluginInstance(plugin: Plugin): Promise<PluginInstance> {
    try {
      // In a real implementation, this would load the plugin code
      // For now, we'll use dynamic import with sandboxing
      const moduleUrl = new URL(plugin.main, `${plugin.path}/`).href;
      
      // Create sandboxed module
      const sandboxedCode = await this.sandbox.createSandboxedModule(moduleUrl, plugin);
      
      // Execute in sandbox
      const moduleExports = await this.sandbox.execute(sandboxedCode, this.createPluginContext(plugin));
      
      if (!moduleExports.activate || !moduleExports.deactivate) {
        throw new Error('Plugin must export activate and deactivate functions');
      }
      
      return moduleExports;
    } catch (error) {
      throw new Error(`Failed to load plugin instance: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Create plugin context with APIs
   */
  private createPluginContext(plugin: Plugin): PluginContext {
    const self = this;
    
    return {
      plugin,
      
      hooks: {
        register: (event: string, handler: Function, priority?: number) => {
          self.hooks.register(plugin.id, event, handler, priority);
        },
        unregister: (event: string, handler: Function) => {
          self.hooks.unregister(plugin.id, event, handler);
        }
      },
      
      events: {
        emit: (event: string, data: any) => {
          self.eventBus.emit(event, data);
        },
        on: (event: string, handler: Function) => {
          self.eventBus.on(event, handler);
        },
        off: (event: string, handler: Function) => {
          self.eventBus.off(event, handler);
        }
      },
      
      data: {
        readArticle: async (slug: string) => {
          self.sandbox.validatePermissions(plugin, 'read:articles');
          // Implementation would fetch article
          return null;
        },
        writeArticle: async (slug: string, data: any) => {
          self.sandbox.validatePermissions(plugin, 'write:articles');
          // Implementation would write article
        },
        readUser: async (id: string) => {
          self.sandbox.validatePermissions(plugin, 'read:users');
          // Implementation would fetch user
          return null;
        },
        readComments: async (articleSlug: string) => {
          self.sandbox.validatePermissions(plugin, 'read:comments');
          // Implementation would fetch comments
          return [];
        },
        writeComment: async (articleSlug: string, data: any) => {
          self.sandbox.validatePermissions(plugin, 'write:comments');
          // Implementation would write comment
        }
      },
      
      ui: {
        registerSidebarPanel: (panel: any) => {
          // Implementation would register UI panel
        },
        registerCommand: (command: any) => {
          // Implementation would register command
        },
        showNotification: (message: string, type?: string) => {
          // Implementation would show notification
        }
      },
      
      storage: {
        get: async (key: string) => {
          self.sandbox.validatePermissions(plugin, 'storage');
          // Implementation would get from plugin storage
          return null;
        },
        set: async (key: string, value: any) => {
          self.sandbox.validatePermissions(plugin, 'storage');
          // Implementation would set plugin storage
        },
        delete: async (key: string) => {
          self.sandbox.validatePermissions(plugin, 'storage');
          // Implementation would delete from plugin storage
        }
      },
      
      logger: {
        log: (...args: any[]) => {
          console.log(`[${plugin.name}]`, ...args);
        },
        warn: (...args: any[]) => {
          console.warn(`[${plugin.name}]`, ...args);
        },
        error: (...args: any[]) => {
          console.error(`[${plugin.name}]`, ...args);
        }
      }
    };
  }

  /**
   * Deactivate a plugin
   */
  async deactivate(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    
    if (!plugin) {
      throw new Error(`Plugin ${pluginId} not found`);
    }
    
    if (!plugin.active) {
      throw new Error(`Plugin ${pluginId} is not active`);
    }
    
    try {
      const instance = this.instances.get(pluginId);
      
      if (instance) {
        await instance.deactivate();
        this.instances.delete(pluginId);
      }
      
      // Unregister hooks
      this.hooks.unregisterAll(pluginId);
      
      // Update plugin state
      plugin.active = false;
      plugin.enabled = false;
      plugin.instance = undefined;
      
      await this.audit.log({
        pluginId,
        action: 'deactivate',
        success: true
      });
      
      // Emit deactivation event
      this.eventBus.emit('plugin:deactivated', { pluginId });
      
    } catch (error) {
      await this.audit.log({
        pluginId,
        action: 'deactivate',
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
      
      throw error;
    }
  }

  /**
   * Uninstall a plugin
   */
  async uninstall(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    
    if (!plugin) {
      throw new Error(`Plugin ${pluginId} not found`);
    }
    
    // Deactivate if active
    if (plugin.active) {
      await this.deactivate(pluginId);
    }
    
    // Remove plugin
    this.plugins.delete(pluginId);
    
    await this.audit.log({
      pluginId,
      action: 'uninstall',
      success: true
    });
    
    // Emit uninstallation event
    this.eventBus.emit('plugin:uninstalled', { pluginId });
  }

  /**
   * Get all installed plugins
   */
  getPlugins(): Plugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Get a specific plugin
   */
  getPlugin(pluginId: string): Plugin | undefined {
    return this.plugins.get(pluginId);
  }

  /**
   * Check if a plugin is installed
   */
  isInstalled(pluginId: string): boolean {
    return this.plugins.has(pluginId);
  }

  /**
   * Check if a plugin is active
   */
  isActive(pluginId: string): boolean {
    const plugin = this.plugins.get(pluginId);
    return plugin?.active ?? false;
  }
}

export const pluginLoader = new PluginLoader();

/**
 * Plugin & Extension System Types
 * OC-109: Plugin manifest schema and core types
 */

export interface PluginManifest {
  // Identity
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  homepage?: string;
  repository?: string;
  license: string;
  
  // Entry points
  main: string;
  ui?: string;
  styles?: string;
  
  // Permissions
  permissions: PluginPermission[];
  
  // Extension points
  contributes?: {
    hooks?: HookDefinition[];
    sidebarPanels?: SidebarPanelDefinition[];
    editorExtensions?: EditorExtensionDefinition[];
    commands?: CommandDefinition[];
    settings?: SettingDefinition[];
  };
  
  // Metadata
  keywords?: string[];
  icon?: string;
  screenshots?: string[];
  rating?: number;
  downloads?: number;
  featured?: boolean;
  
  // Compatibility
  engines: {
    aidepedia: string;
  };
  
  // Configuration
  configuration?: PluginConfiguration;
}

export type PluginPermission = 
  | 'read:articles'
  | 'write:articles'
  | 'read:users'
  | 'write:users'
  | 'read:comments'
  | 'write:comments'
  | 'admin'
  | 'network'
  | 'storage';

export interface HookDefinition {
  event: string;
  handler: string;
  priority?: number;
}

export interface SidebarPanelDefinition {
  id: string;
  title: string;
  icon: string;
  position?: 'top' | 'bottom';
}

export interface EditorExtensionDefinition {
  id: string;
  type: 'toolbar' | 'menu' | 'contextMenu';
  label: string;
  icon?: string;
  action: string;
}

export interface CommandDefinition {
  id: string;
  title: string;
  category?: string;
  shortcut?: string;
  action: string;
}

export interface SettingDefinition {
  id: string;
  type: 'string' | 'number' | 'boolean' | 'select';
  title: string;
  description?: string;
  default?: any;
  options?: { label: string; value: any }[];
}

export interface PluginConfiguration {
  [key: string]: any;
}

export interface Plugin extends PluginManifest {
  // Runtime state
  installed: boolean;
  active: boolean;
  enabled: boolean;
  installedAt?: Date;
  activatedAt?: Date;
  
  // Paths
  path: string;
  
  // Configuration
  config?: PluginConfiguration;
  
  // Runtime references
  instance?: PluginInstance;
}

export interface PluginInstance {
  activate: (context: PluginContext) => Promise<void>;
  deactivate: () => Promise<void>;
  [key: string]: any;
}

export interface PluginContext {
  // Plugin metadata
  plugin: Plugin;
  
  // Hooks API
  hooks: {
    register: (event: string, handler: Function, priority?: number) => void;
    unregister: (event: string, handler: Function) => void;
  };
  
  // Event bus
  events: {
    emit: (event: string, data: any) => void;
    on: (event: string, handler: Function) => void;
    off: (event: string, handler: Function) => void;
  };
  
  // Data access
  data: {
    readArticle: (slug: string) => Promise<any>;
    writeArticle: (slug: string, data: any) => Promise<void>;
    readUser: (id: string) => Promise<any>;
    readComments: (articleSlug: string) => Promise<any[]>;
    writeComment: (articleSlug: string, data: any) => Promise<void>;
  };
  
  // UI extensions
  ui: {
    registerSidebarPanel: (panel: SidebarPanelDefinition) => void;
    registerCommand: (command: CommandDefinition) => void;
    showNotification: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
  };
  
  // Storage
  storage: {
    get: (key: string) => Promise<any>;
    set: (key: string, value: any) => Promise<void>;
    delete: (key: string) => Promise<void>;
  };
  
  // Utilities
  logger: {
    log: (...args: any[]) => void;
    warn: (...args: any[]) => void;
    error: (...args: any[]) => void;
  };
}

export interface PluginLifecycle {
  install: (pluginPath: string) => Promise<Plugin>;
  activate: (pluginId: string) => Promise<void>;
  deactivate: (pluginId: string) => Promise<void>;
  uninstall: (pluginId: string) => Promise<void>;
  update: (pluginId: string) => Promise<void>;
}

export interface PluginMarketplace {
  search: (query: string) => Promise<Plugin[]>;
  getFeatured: () => Promise<Plugin[]>;
  getDetails: (pluginId: string) => Promise<Plugin>;
  getReviews: (pluginId: string) => Promise<PluginReview[]>;
  submitReview: (pluginId: string, review: PluginReview) => Promise<void>;
}

export interface PluginReview {
  id: string;
  pluginId: string;
  userId: string;
  userName: string;
  rating: number;
  comment: string;
  createdAt: Date;
  helpful: number;
}

export interface PluginSandbox {
  execute: (code: string, context: PluginContext) => Promise<any>;
  validatePermissions: (plugin: Plugin, permission: PluginPermission) => boolean;
  applyRateLimit: (pluginId: string, action: string) => boolean;
}

export interface PluginAuditLog {
  id: string;
  pluginId: string;
  action: string;
  timestamp: Date;
  details?: any;
  userId?: string;
  success: boolean;
  error?: string;
}

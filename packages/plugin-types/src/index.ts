/**
 * @aidepedia/plugin-types
 * TypeScript types for AIdepedia plugins
 */

// Re-export all types from the main plugin system
export type {
  PluginManifest,
  PluginPermission,
  HookDefinition,
  SidebarPanelDefinition,
  EditorExtensionDefinition,
  CommandDefinition,
  SettingDefinition,
  PluginConfiguration,
  Plugin,
  PluginInstance,
  PluginContext,
  PluginLifecycle,
  PluginMarketplace,
  PluginReview,
  PluginSandbox,
  PluginAuditLog
} from './types';

// Export hook events
export { HookEvents } from './hooks';

// Export plugin events
export { PluginEvents } from './events';

// Convenience types for plugin developers
export interface Article {
  id: string;
  slug: string;
  title: string;
  content: string;
  excerpt?: string;
  author: User;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
  publishedAt?: Date;
  status: 'draft' | 'published' | 'archived';
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  role: 'user' | 'admin' | 'moderator';
  createdAt: Date;
}

export interface Comment {
  id: string;
  articleSlug: string;
  author: User;
  content: string;
  createdAt: Date;
  updatedAt?: Date;
  parentId?: string;
  replies?: Comment[];
}

// Plugin API response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

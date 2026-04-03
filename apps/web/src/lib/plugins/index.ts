/**
 * Plugin & Extension System
 * OC-109: Main entry point for plugin functionality
 */

import { PluginLoader } from './loader.js';
import { HookSystem, hookSystem, HookEvents } from './hooks.js';
import { EventBus, eventBus, PluginEvents } from './event-bus.js';
import { PluginSandbox, pluginSandbox } from './sandbox.js';
import { PluginAudit, pluginAudit } from './audit.js';
import { PluginScaffolder } from './cli.js';

// Core types
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
  PluginSandbox as PluginSandboxType,
  PluginAuditLog
} from './types.js';

// Core systems
export { PluginLoader } from './loader.js';
export { HookSystem, hookSystem, HookEvents } from './hooks.js';
export { EventBus, eventBus, PluginEvents } from './event-bus.js';
export { PluginSandbox, pluginSandbox } from './sandbox.js';
export { PluginAudit, pluginAudit } from './audit.js';

// Developer tools
export { PluginScaffolder } from './cli.js';

/**
 * Initialize the plugin system
 */
export async function initializePluginSystem(pluginDir?: string): Promise<PluginLoader> {
  const loader = new PluginLoader(pluginDir);
  
  // In production, this would:
  // 1. Load installed plugins from database
  // 2. Validate plugin manifests
  // 3. Activate enabled plugins
  // 4. Set up event listeners
  
  console.log('Plugin system initialized');
  
  return loader;
}

/**
 * Plugin system configuration
 */
export interface PluginSystemConfig {
  pluginDir: string;
  maxPlugins: number;
  enableMarketplace: boolean;
  enableDeveloperTools: boolean;
  strictPermissions: boolean;
  auditEnabled: boolean;
}

export const defaultConfig: PluginSystemConfig = {
  pluginDir: './plugins',
  maxPlugins: 50,
  enableMarketplace: true,
  enableDeveloperTools: true,
  strictPermissions: true,
  auditEnabled: true
};

/**
 * Plugin Events
 */

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

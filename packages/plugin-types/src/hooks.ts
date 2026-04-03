/**
 * Plugin Hook Events
 */

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

# Plugin & Extension System (OC-109)

AIdepedia's plugin system allows developers to extend and customize the platform with custom functionality.

## Overview

The plugin system provides:
- **Plugin Architecture**: Manifest schema, loading system, sandboxed execution, and lifecycle management
- **Plugin API**: Hooks, event bus, data access, and UI extension points
- **Plugin Marketplace**: Browse, install, rate, and review plugins
- **Developer Tools**: CLI scaffolding, local development, debugging, and documentation
- **Security & Permissions**: Permission system, rate limiting, and audit logging

## Quick Start

### Installing a Plugin

1. Navigate to **Settings > Plugins**
2. Browse the marketplace or search for a plugin
3. Click **Install** on the desired plugin
4. Click **Activate** to enable the plugin

### Creating a Plugin

Use the CLI scaffolding tool:

```bash
pnpm run scaffold-plugin create \
  --name "My Plugin" \
  --description "Does something cool" \
  --author "Your Name" \
  --permissions "read:articles,write:articles" \
  --output ./plugins
```

This creates a plugin directory with:
```
my-plugin/
├── plugin.json        # Plugin manifest
├── src/
│   └── index.ts       # Main entry point
├── package.json       # Dependencies
├── tsconfig.json      # TypeScript config
└── README.md          # Documentation
```

## Plugin Manifest

The `plugin.json` file defines your plugin:

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "description": "Plugin description",
  "author": "Your Name",
  "license": "MIT",
  "main": "./dist/index.js",
  "permissions": ["read:articles", "write:articles"],
  "engines": {
    "aidepedia": "^6.0.0"
  },
  "contributes": {
    "hooks": [
      {
        "event": "editor:before:save",
        "handler": "onBeforeSave",
        "priority": 10
      }
    ],
    "commands": [
      {
        "id": "my-plugin.hello",
        "title": "Say Hello",
        "category": "My Plugin",
        "action": "sayHello"
      }
    ]
  }
}
```

## Plugin API

### Context Object

Plugins receive a context object with APIs:

```typescript
export const activate = async (context: PluginContext) => {
  // Hooks
  context.hooks.register('editor:before:save', async (hookContext) => {
    return hookContext.data;
  });

  // Events
  context.events.on('article:created', (data) => {
    console.log('New article:', data);
  });

  // Data access
  const article = await context.data.readArticle('my-article');

  // UI extensions
  context.ui.registerCommand({
    id: 'my-plugin.action',
    title: 'My Action',
    action: 'performAction'
  });

  // Storage
  await context.storage.set('key', 'value');
  const value = await context.storage.get('key');

  // Logging
  context.logger.log('Plugin activated');
};
```

### Hooks

Register hooks to intercept and modify data:

```typescript
// Before article save
context.hooks.register('editor:before:save', async (hookContext) => {
  // Modify content before saving
  hookContext.data.content = modifyContent(hookContext.data.content);
  return hookContext.data;
});

// After article publish
context.hooks.register('article:after:publish', async (hookContext) => {
  // Notify external services
  await notifyWebhook(hookContext.data);
});
```

Available hooks:
- `article:before:create` / `article:after:create`
- `article:before:update` / `article:after:update`
- `article:before:delete` / `article:after:delete`
- `article:before:publish` / `article:after:publish`
- `editor:before:save` / `editor:after:save`
- `editor:render:toolbar` / `editor:render:sidebar`
- `comment:before:create` / `comment:after:create`
- `plugin:before:activate` / `plugin:after:activate`

### Event Bus

Listen to and emit events:

```typescript
// Listen to events
context.events.on('article:viewed', (data) => {
  context.logger.log(`Article ${data.slug} viewed`);
});

// Emit custom events
context.events.emit('my-plugin:custom-event', {
  message: 'Hello from my plugin'
});
```

Available events:
- `plugin:installed` / `plugin:activated` / `plugin:deactivated` / `plugin:uninstalled`
- `article:created` / `article:updated` / `article:deleted` / `article:published` / `article:viewed`
- `user:logged:in` / `user:logged:out` / `user:updated`
- `comment:created` / `comment:updated` / `comment:deleted`
- `system:startup` / `system:shutdown` / `system:error`

### Data Access

Read and write data (requires permissions):

```typescript
// Read article
const article = await context.data.readArticle('article-slug');

// Write article
await context.data.writeArticle('article-slug', {
  title: 'New Title',
  content: 'Updated content'
});

// Read user
const user = await context.data.readUser('user-id');

// Read comments
const comments = await context.data.readComments('article-slug');

// Write comment
await context.data.writeComment('article-slug', {
  content: 'Great article!'
});
```

### UI Extensions

Add UI elements:

```typescript
// Register sidebar panel
context.ui.registerSidebarPanel({
  id: 'my-panel',
  title: 'My Panel',
  icon: '📊',
  position: 'top'
});

// Register command
context.ui.registerCommand({
  id: 'my-plugin.custom-action',
  title: 'Custom Action',
  category: 'My Plugin',
  shortcut: 'Ctrl+Shift+M',
  action: 'performAction'
});

// Show notification
context.ui.showNotification('Action completed!', 'success');
```

## Permissions

Plugins must declare required permissions:

```json
{
  "permissions": [
    "read:articles",
    "write:articles",
    "read:users",
    "write:users",
    "read:comments",
    "write:comments",
    "admin",
    "network",
    "storage"
  ]
}
```

- `read:articles` / `write:articles`: Access articles
- `read:users` / `write:users`: Access user data
- `read:comments` / `write:comments`: Access comments
- `admin`: Full administrative access
- `network`: Make network requests
- `storage`: Use plugin storage

## Security

### Sandboxed Execution

Plugins run in a sandboxed environment with:
- Restricted global access
- Code validation for dangerous patterns
- Execution timeouts
- Memory limits

### Rate Limiting

API calls are rate-limited:
- Read operations: 200 requests/minute
- Write operations: 50 requests/minute
- Default: 100 requests/minute

### Audit Logging

All plugin actions are logged:
- Installation/activation/deactivation
- Data access
- API calls
- Errors

View audit logs in **Settings > Plugins > Audit Log**

## Development

### Local Development

1. Scaffold a new plugin
2. Build with `pnpm build`
3. Load in AIdepedia:
   - Go to **Settings > Plugins**
   - Click **Load Local Plugin**
   - Select your plugin directory

### Debugging

Use the plugin logger:

```typescript
context.logger.log('Debug message');
context.logger.warn('Warning message');
context.logger.error('Error message');
```

Check the browser console for plugin logs.

### Testing

Test your plugin:

```bash
# Run linting
pnpm lint

# Run type checking
pnpm typecheck

# Run tests
pnpm test
```

## Publishing

To publish your plugin to the marketplace:

1. Ensure your plugin passes all tests
2. Create a comprehensive README
3. Add screenshots to the manifest
4. Submit to the AIdepedia plugin registry
5. After review, your plugin will be published

## API Reference

### REST API Endpoints

- `GET /api/v1/plugins` - List plugins
- `GET /api/v1/plugins?q=query` - Search plugins
- `GET /api/v1/plugins?featured=true` - Get featured plugins
- `GET /api/v1/plugins?installed=true` - Get installed plugins
- `POST /api/v1/plugins` - Install a plugin
- `GET /api/v1/plugins/:id` - Get plugin details
- `PATCH /api/v1/plugins/:id` - Update plugin (activate/deactivate)
- `DELETE /api/v1/plugins/:id` - Uninstall plugin
- `GET /api/v1/plugins/:id/reviews` - Get plugin reviews
- `POST /api/v1/plugins/:id/reviews` - Submit a review
- `GET /api/v1/plugins/audit` - Get audit logs

## Examples

### Simple Plugin

```typescript
import type { PluginInstance, PluginContext } from '@aidepedia/plugin-types';

export const activate = async (context: PluginContext): Promise<void> => {
  context.logger.log('Plugin activated');
  
  context.hooks.register('editor:before:save', async (hookContext) => {
    context.logger.log('Saving article...');
    return hookContext.data;
  });
};

export const deactivate = async (): Promise<void> => {
  console.log('Plugin deactivated');
};

const plugin: PluginInstance = { activate, deactivate };
export default plugin;
```

### Advanced Plugin

```typescript
import type { PluginInstance, PluginContext } from '@aidepedia/plugin-types';

export const activate = async (context: PluginContext): Promise<void> => {
  // Register hooks
  context.hooks.register('article:after:publish', async (hookContext) => {
    // Auto-tweet new articles
    if (context.plugin.permissions.includes('network')) {
      await tweetArticle(hookContext.data);
    }
  });

  // Register commands
  context.ui.registerCommand({
    id: 'social-share.share',
    title: 'Share on Social Media',
    category: 'Social Share',
    action: 'shareArticle'
  });

  // Listen to events
  context.events.on('article:viewed', async (data) => {
    // Track analytics
    await context.storage.set(`views:${data.slug}`, Date.now());
  });
};

export const deactivate = async (): Promise<void> => {
  // Cleanup
};

async function tweetArticle(article: any) {
  // Tweet logic
}

const plugin: PluginInstance = {
  activate,
  deactivate,
  shareArticle: async () => {
    // Share logic
  }
};

export default plugin;
```

## Support

- Documentation: https://aidepedia.com/docs/plugins
- GitHub: https://github.com/Udomaki/aidepedia
- Community: https://discord.gg/aidepedia

## License

MIT

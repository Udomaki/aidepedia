/**
 * Plugin Marketplace API
 * OC-109: Browse, install, and manage plugins
 */

import type { APIRoute } from 'astro';
import { pluginLoader } from '../../../../lib/plugins/loader';
import type { Plugin, PluginReview } from '../../../../lib/plugins/types';

// Mock marketplace data (in production, this would come from a database or external registry)
const mockPlugins: Plugin[] = [
  {
    id: 'markdown-emoji',
    name: 'Markdown Emoji',
    version: '1.0.0',
    description: 'Add emoji support to markdown editor with auto-complete',
    author: 'AIdepedia Team',
    license: 'MIT',
    main: './dist/index.js',
    permissions: ['read:articles', 'write:articles'],
    engines: { aidepedia: '^6.0.0' },
    path: '/plugins/markdown-emoji',
    installed: false,
    active: false,
    enabled: false,
    keywords: ['markdown', 'emoji', 'editor'],
    icon: '😊',
    downloads: 1250,
    rating: 4.8,
    featured: true
  },
  {
    id: 'ai-suggestions',
    name: 'AI Writing Suggestions',
    version: '2.1.0',
    description: 'Get AI-powered writing suggestions and improvements',
    author: 'AIdepedia Labs',
    license: 'MIT',
    main: './dist/index.js',
    permissions: ['read:articles', 'write:articles', 'network'],
    engines: { aidepedia: '^6.0.0' },
    path: '/plugins/ai-suggestions',
    installed: false,
    active: false,
    enabled: false,
    keywords: ['ai', 'writing', 'suggestions'],
    icon: '🤖',
    downloads: 3200,
    rating: 4.9,
    featured: true
  },
  {
    id: 'theme-dark-mode',
    name: 'Enhanced Dark Mode',
    version: '1.2.0',
    description: 'Advanced dark mode with custom color schemes',
    author: 'Community',
    license: 'MIT',
    main: './dist/index.js',
    permissions: ['storage'],
    engines: { aidepedia: '^6.0.0' },
    path: '/plugins/theme-dark-mode',
    installed: false,
    active: false,
    enabled: false,
    keywords: ['theme', 'dark', 'colors'],
    icon: '🌙',
    downloads: 890,
    rating: 4.5,
    featured: false
  },
  {
    id: 'export-pdf',
    name: 'PDF Export',
    version: '1.0.0',
    description: 'Export articles to PDF with custom styling',
    author: 'AIdepedia Team',
    license: 'MIT',
    main: './dist/index.js',
    permissions: ['read:articles'],
    engines: { aidepedia: '^6.0.0' },
    path: '/plugins/export-pdf',
    installed: false,
    active: false,
    enabled: false,
    keywords: ['export', 'pdf', 'document'],
    icon: '📄',
    downloads: 2100,
    rating: 4.7,
    featured: true
  }
];

const mockReviews: PluginReview[] = [
  {
    id: 'review-1',
    pluginId: 'markdown-emoji',
    userId: 'user-1',
    userName: 'John D.',
    rating: 5,
    comment: 'Works perfectly! The auto-complete is super fast.',
    createdAt: new Date('2024-01-15'),
    helpful: 12
  },
  {
    id: 'review-2',
    pluginId: 'markdown-emoji',
    userId: 'user-2',
    userName: 'Sarah K.',
    rating: 4,
    comment: 'Great plugin, would love more emoji packs.',
    createdAt: new Date('2024-01-10'),
    helpful: 8
  }
];

/**
 * GET /api/v1/plugins - List available plugins
 */
export const GET: APIRoute = async ({ url }) => {
  try {
    const query = url.searchParams.get('q');
    const featured = url.searchParams.get('featured');
    const installed = url.searchParams.get('installed');
    
    let plugins = [...mockPlugins];
    
    // Filter by search query
    if (query) {
      const lowerQuery = query.toLowerCase();
      plugins = plugins.filter(p => 
        p.name.toLowerCase().includes(lowerQuery) ||
        p.description.toLowerCase().includes(lowerQuery) ||
        p.keywords?.some(k => k.includes(lowerQuery))
      );
    }
    
    // Filter featured
    if (featured === 'true') {
      plugins = plugins.filter(p => p.featured);
    }
    
    // Get installed plugins
    if (installed === 'true') {
      const installedPlugins = pluginLoader.getPlugins();
      return new Response(JSON.stringify(installedPlugins), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Merge with installed status
    const installedMap = new Map(
      pluginLoader.getPlugins().map(p => [p.id, p])
    );
    
    const result = plugins.map(p => {
      const installed = installedMap.get(p.id);
      return installed ? { ...p, ...installed } : p;
    });
    
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ 
      error: 'Failed to fetch plugins',
      message: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

/**
 * POST /api/v1/plugins - Install a plugin
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { pluginId, pluginPath } = body;
    
    // Find plugin in marketplace
    const plugin = mockPlugins.find(p => p.id === pluginId);
    
    if (!plugin) {
      return new Response(JSON.stringify({ 
        error: 'Plugin not found in marketplace' 
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Install plugin
    const installed = await pluginLoader.install(pluginPath || plugin.path);
    
    return new Response(JSON.stringify(installed), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ 
      error: 'Failed to install plugin',
      message: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

/**
 * Plugin Management API
 * OC-109: Activate, deactivate, and uninstall plugins
 */

import type { APIRoute } from 'astro';
import { pluginLoader } from '../../../../lib/plugins/loader';
import { pluginAudit } from '../../../../lib/plugins/audit';

/**
 * GET /api/v1/plugins/[id] - Get plugin details
 */
export const GET: APIRoute = async ({ params }) => {
  try {
    const { id } = params;
    
    if (!id) {
      return new Response(JSON.stringify({ error: 'Plugin ID required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const plugin = pluginLoader.getPlugin(id);
    
    if (!plugin) {
      return new Response(JSON.stringify({ error: 'Plugin not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Get audit logs for this plugin
    const recentLogs = pluginAudit.getPluginLogs(id, 10);
    
    return new Response(JSON.stringify({
      ...plugin,
      recentActivity: recentLogs
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ 
      error: 'Failed to get plugin',
      message: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

/**
 * PATCH /api/v1/plugins/[id] - Update plugin state
 */
export const PATCH: APIRoute = async ({ params, request }) => {
  try {
    const { id } = params;
    const body = await request.json();
    const { action } = body;
    
    if (!id) {
      return new Response(JSON.stringify({ error: 'Plugin ID required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    switch (action) {
      case 'activate':
        await pluginLoader.activate(id);
        return new Response(JSON.stringify({ 
          success: true,
          message: 'Plugin activated' 
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
        
      case 'deactivate':
        await pluginLoader.deactivate(id);
        return new Response(JSON.stringify({ 
          success: true,
          message: 'Plugin deactivated' 
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
        
      case 'update':
        // In production, this would update the plugin
        return new Response(JSON.stringify({ 
          success: true,
          message: 'Plugin updated' 
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
        
      default:
        return new Response(JSON.stringify({ 
          error: 'Invalid action. Use: activate, deactivate, or update' 
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
    }
  } catch (error) {
    return new Response(JSON.stringify({ 
      error: 'Failed to update plugin',
      message: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

/**
 * DELETE /api/v1/plugins/[id] - Uninstall plugin
 */
export const DELETE: APIRoute = async ({ params }) => {
  try {
    const { id } = params;
    
    if (!id) {
      return new Response(JSON.stringify({ error: 'Plugin ID required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    await pluginLoader.uninstall(id);
    
    return new Response(JSON.stringify({ 
      success: true,
      message: 'Plugin uninstalled' 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ 
      error: 'Failed to uninstall plugin',
      message: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

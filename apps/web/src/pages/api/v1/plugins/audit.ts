/**
 * Plugin Audit Log API
 * OC-109: View plugin activity and audit trail
 */

import type { APIRoute } from 'astro';
import { pluginAudit } from '../../../../lib/plugins/audit';

/**
 * GET /api/v1/plugins/audit - Get audit logs
 */
export const GET: APIRoute = async ({ url }) => {
  try {
    const pluginId = url.searchParams.get('pluginId');
    const action = url.searchParams.get('action');
    const limit = parseInt(url.searchParams.get('limit') || '100');
    const minutes = parseInt(url.searchParams.get('minutes') || '0');

    let logs;

    if (pluginId) {
      logs = pluginAudit.getPluginLogs(pluginId, limit);
    } else if (action) {
      logs = pluginAudit.getLogsByAction(action, limit);
    } else if (minutes > 0) {
      logs = pluginAudit.getRecentActivity(minutes);
    } else {
      logs = pluginAudit.getAllLogs(limit);
    }

    // Get statistics
    const stats = pluginAudit.getStats();

    return new Response(JSON.stringify({
      logs,
      stats: {
        total: stats.totalLogs,
        successRate: stats.successRate,
        topActions: Array.from(stats.actionCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10),
        topPlugins: Array.from(stats.pluginCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ 
      error: 'Failed to get audit logs',
      message: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

/**
 * DELETE /api/v1/plugins/audit - Clear audit logs
 */
export const DELETE: APIRoute = async () => {
  try {
    pluginAudit.clear();
    
    return new Response(JSON.stringify({ 
      success: true,
      message: 'Audit logs cleared' 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ 
      error: 'Failed to clear audit logs',
      message: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

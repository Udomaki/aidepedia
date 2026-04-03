/**
 * Plugin Audit Logging
 * OC-109: Audit trail for plugin actions
 */

import type { PluginAuditLog } from './types';

export class PluginAudit {
  private logs: PluginAuditLog[] = [];
  private maxLogs = 10000;
  private logIdCounter = 0;

  /**
   * Log a plugin action
   */
  async log(entry: Omit<PluginAuditLog, 'id' | 'timestamp'>): Promise<PluginAuditLog> {
    const log: PluginAuditLog = {
      id: `audit-${++this.logIdCounter}`,
      timestamp: new Date(),
      ...entry
    };
    
    this.logs.push(log);
    
    // Trim logs if needed
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }
    
    // In production, also persist to database
    await this.persistLog(log);
    
    return log;
  }

  /**
   * Persist log to storage
   */
  private async persistLog(log: PluginAuditLog): Promise<void> {
    // In production, this would write to a database
    // For now, just log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.log('[Plugin Audit]', log);
    }
  }

  /**
   * Get logs for a specific plugin
   */
  getPluginLogs(pluginId: string, limit?: number): PluginAuditLog[] {
    const pluginLogs = this.logs.filter(log => log.pluginId === pluginId);
    
    if (limit) {
      return pluginLogs.slice(-limit);
    }
    
    return pluginLogs;
  }

  /**
   * Get logs by action type
   */
  getLogsByAction(action: string, limit?: number): PluginAuditLog[] {
    const actionLogs = this.logs.filter(log => log.action === action);
    
    if (limit) {
      return actionLogs.slice(-limit);
    }
    
    return actionLogs;
  }

  /**
   * Get all logs
   */
  getAllLogs(limit?: number): PluginAuditLog[] {
    if (limit) {
      return this.logs.slice(-limit);
    }
    
    return [...this.logs];
  }

  /**
   * Get failed actions
   */
  getFailedActions(pluginId?: string): PluginAuditLog[] {
    return this.logs.filter(log => {
      const matchesPlugin = pluginId ? log.pluginId === pluginId : true;
      return matchesPlugin && !log.success;
    });
  }

  /**
   * Get recent activity
   */
  getRecentActivity(minutes: number = 60): PluginAuditLog[] {
    const cutoff = new Date(Date.now() - minutes * 60 * 1000);
    return this.logs.filter(log => log.timestamp >= cutoff);
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalLogs: number;
    successRate: number;
    actionCounts: Map<string, number>;
    pluginCounts: Map<string, number>;
  } {
    const totalLogs = this.logs.length;
    const successCount = this.logs.filter(log => log.success).length;
    const successRate = totalLogs > 0 ? successCount / totalLogs : 0;
    
    const actionCounts = new Map<string, number>();
    const pluginCounts = new Map<string, number>();
    
    for (const log of this.logs) {
      actionCounts.set(log.action, (actionCounts.get(log.action) || 0) + 1);
      pluginCounts.set(log.pluginId, (pluginCounts.get(log.pluginId) || 0) + 1);
    }
    
    return {
      totalLogs,
      successRate,
      actionCounts,
      pluginCounts
    };
  }

  /**
   * Clear logs
   */
  clear(): void {
    this.logs = [];
  }

  /**
   * Export logs
   */
  export(): string {
    return JSON.stringify(this.logs, null, 2);
  }

  /**
   * Import logs
   */
  import(logs: PluginAuditLog[]): void {
    this.logs = logs;
    this.logIdCounter = logs.length > 0 
      ? Math.max(...logs.map(l => parseInt(l.id.split('-')[1])))
      : 0;
  }
}

export const pluginAudit = new PluginAudit();

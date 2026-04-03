import {
  createDashboard,
  getDashboard,
  listUserDashboards,
  updateDashboard,
  deleteDashboard,
  createReport,
  getReport,
  listUserReports,
  deleteReport,
  createScheduledReport,
  listScheduledReports,
  getPendingScheduledReports,
  updateScheduledReportNextRun,
  getUsageAnalytics,
  getContentAnalytics,
  getUserAnalytics,
  getRetentionAnalytics,
  getRevenueAnalytics,
  createExportRecord,
  getExportHistory,
  calculateEngagementScore,
  predictChurn,
} from '@aidepedia/db';

export {
  createDashboard,
  getDashboard,
  listUserDashboards,
  updateDashboard,
  deleteDashboard,
  createReport,
  getReport,
  listUserReports,
  deleteReport,
  createScheduledReport,
  listScheduledReports,
  getPendingScheduledReports,
  updateScheduledReportNextRun,
  getUsageAnalytics,
  getContentAnalytics,
  getUserAnalytics,
  getRetentionAnalytics,
  getRevenueAnalytics,
  createExportRecord,
  getExportHistory,
  calculateEngagementScore,
  predictChurn,
};

// Export utilities
export async function exportToCSV(data: any[], filename: string): Promise<string> {
  if (data.length === 0) return '';

  const headers = Object.keys(data[0]);
  const csvRows = [headers.join(',')];

  for (const row of data) {
    const values = headers.map(header => {
      const value = row[header];
      if (value === null || value === undefined) return '';
      if (typeof value === 'string' && value.includes(',')) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return String(value);
    });
    csvRows.push(values.join(','));
  }

  return csvRows.join('\n');
}

export async function exportToJSON(data: any): Promise<string> {
  return JSON.stringify(data, null, 2);
}

// Widget configuration helpers
export const widgetTypes = {
  chart: {
    line: 'Line Chart',
    bar: 'Bar Chart',
    pie: 'Pie Chart',
    area: 'Area Chart',
  },
  metric: {
    single: 'Single Metric',
    comparison: 'Metric Comparison',
    trend: 'Metric with Trend',
  },
  table: {
    simple: 'Simple Table',
    sortable: 'Sortable Table',
    paginated: 'Paginated Table',
  },
} as const;

export function getWidgetDefaultConfig(type: string, subType: string): Record<string, any> {
  switch (type) {
    case 'chart':
      return {
        chartType: subType,
        showLegend: true,
        showGrid: true,
        colors: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'],
      };
    case 'metric':
      return {
        showTrend: subType === 'trend',
        showComparison: subType === 'comparison',
        format: 'number',
      };
    case 'table':
      return {
        sortable: subType !== 'simple',
        pagination: subType === 'paginated',
        pageSize: 10,
      };
    default:
      return {};
  }
}

// Dashboard sharing utilities
export function generateShareUrl(dashboardId: number, token?: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const shareToken = token || generateShareToken();
  return `${baseUrl}/dashboards/shared/${dashboardId}?token=${shareToken}`;
}

export function generateShareToken(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// Report scheduling utilities
export function calculateNextRun(schedule: 'daily' | 'weekly' | 'monthly'): Date {
  const now = new Date();
  const nextRun = new Date(now);

  switch (schedule) {
    case 'daily':
      nextRun.setDate(nextRun.getDate() + 1);
      nextRun.setHours(9, 0, 0, 0); // 9 AM next day
      break;
    case 'weekly':
      nextRun.setDate(nextRun.getDate() + 7);
      nextRun.setHours(9, 0, 0, 0); // 9 AM next week
      break;
    case 'monthly':
      nextRun.setMonth(nextRun.getMonth() + 1);
      nextRun.setDate(1);
      nextRun.setHours(9, 0, 0, 0); // 9 AM on 1st of next month
      break;
  }

  return nextRun;
}

// Analytics data aggregation
export async function aggregateAnalyticsData(
  type: 'usage' | 'content' | 'user' | 'revenue' | 'retention',
  startDate: Date,
  endDate: Date
): Promise<any> {
  switch (type) {
    case 'usage':
      return getUsageAnalytics(startDate, endDate);
    case 'content':
      return getContentAnalytics(startDate, endDate);
    case 'user':
      return getUserAnalytics(startDate, endDate);
    case 'revenue':
      return getRevenueAnalytics(startDate, endDate);
    case 'retention':
      return getRetentionAnalytics();
    default:
      throw new Error(`Unknown analytics type: ${type}`);
  }
}

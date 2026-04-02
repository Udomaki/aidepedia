/**
 * Custom Dashboard Service
 * Allows users to create and manage custom dashboards with drag-and-drop widgets
 */

export interface DashboardWidget {
  id: string;
  type: WidgetType;
  title: string;
  config: Record<string, any>;
  position: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export type WidgetType = 
  | 'traffic-chart'
  | 'top-articles'
  | 'user-segments'
  | 'content-gaps'
  | 'predictions'
  | 'engagement-patterns'
  | 'geographic-distribution'
  | 'traffic-sources'
  | 'custom-metric';

export interface CustomDashboard {
  id: string;
  name: string;
  description?: string;
  userId: string;
  widgets: DashboardWidget[];
  createdAt: Date;
  updatedAt: Date;
  isDefault: boolean;
}

/**
 * In-memory storage for dashboards (would be database in production)
 * Note: In a real implementation, this would use the database
 */
const dashboardStore = new Map<string, CustomDashboard>();

/**
 * Create a new dashboard
 */
export function createDashboard(
  userId: string,
  name: string,
  description?: string
): CustomDashboard {
  const dashboard: CustomDashboard = {
    id: `dashboard-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name,
    description,
    userId,
    widgets: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    isDefault: false,
  };

  dashboardStore.set(dashboard.id, dashboard);
  return dashboard;
}

/**
 * Get dashboard by ID
 */
export function getDashboard(dashboardId: string): CustomDashboard | null {
  return dashboardStore.get(dashboardId) || null;
}

/**
 * Get all dashboards for a user
 */
export function getUserDashboards(userId: string): CustomDashboard[] {
  return Array.from(dashboardStore.values())
    .filter(d => d.userId === userId)
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

/**
 * Update dashboard
 */
export function updateDashboard(
  dashboardId: string,
  updates: Partial<Pick<CustomDashboard, 'name' | 'description' | 'widgets'>>
): CustomDashboard | null {
  const dashboard = dashboardStore.get(dashboardId);
  if (!dashboard) return null;

  Object.assign(dashboard, updates, { updatedAt: new Date() });
  dashboardStore.set(dashboardId, dashboard);
  return dashboard;
}

/**
 * Add widget to dashboard
 */
export function addWidget(
  dashboardId: string,
  widget: Omit<DashboardWidget, 'id'>
): DashboardWidget | null {
  const dashboard = dashboardStore.get(dashboardId);
  if (!dashboard) return null;

  const newWidget: DashboardWidget = {
    ...widget,
    id: `widget-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  };

  dashboard.widgets.push(newWidget);
  dashboard.updatedAt = new Date();
  dashboardStore.set(dashboardId, dashboard);

  return newWidget;
}

/**
 * Update widget
 */
export function updateWidget(
  dashboardId: string,
  widgetId: string,
  updates: Partial<DashboardWidget>
): DashboardWidget | null {
  const dashboard = dashboardStore.get(dashboardId);
  if (!dashboard) return null;

  const widgetIndex = dashboard.widgets.findIndex(w => w.id === widgetId);
  if (widgetIndex === -1) return null;

  dashboard.widgets[widgetIndex] = {
    ...dashboard.widgets[widgetIndex],
    ...updates,
  };

  dashboard.updatedAt = new Date();
  dashboardStore.set(dashboardId, dashboard);

  return dashboard.widgets[widgetIndex];
}

/**
 * Remove widget
 */
export function removeWidget(
  dashboardId: string,
  widgetId: string
): boolean {
  const dashboard = dashboardStore.get(dashboardId);
  if (!dashboard) return false;

  const widgetIndex = dashboard.widgets.findIndex(w => w.id === widgetId);
  if (widgetIndex === -1) return false;

  dashboard.widgets.splice(widgetIndex, 1);
  dashboard.updatedAt = new Date();
  dashboardStore.set(dashboardId, dashboard);

  return true;
}

/**
 * Delete dashboard
 */
export function deleteDashboard(dashboardId: string): boolean {
  return dashboardStore.delete(dashboardId);
}

/**
 * Set default dashboard for user
 */
export function setDefaultDashboard(userId: string, dashboardId: string): boolean {
  // Remove default from other dashboards
  Array.from(dashboardStore.values())
    .filter(d => d.userId === userId && d.isDefault)
    .forEach(d => {
      d.isDefault = false;
      dashboardStore.set(d.id, d);
    });

  // Set new default
  const dashboard = dashboardStore.get(dashboardId);
  if (!dashboard || dashboard.userId !== userId) return false;

  dashboard.isDefault = true;
  dashboardStore.set(dashboardId, dashboard);
  return true;
}

/**
 * Get default dashboard for user
 */
export function getDefaultDashboard(userId: string): CustomDashboard | null {
  const userDashboards = getUserDashboards(userId);
  return userDashboards.find(d => d.isDefault) || userDashboards[0] || null;
}

/**
 * Get widget templates
 */
export function getWidgetTemplates(): Array<{
  type: WidgetType;
  name: string;
  description: string;
  defaultConfig: Record<string, any>;
  defaultSize: { width: number; height: number };
}> {
  return [
    {
      type: 'traffic-chart',
      name: 'Traffic Chart',
      description: 'Shows page views over time',
      defaultConfig: { days: 7 },
      defaultSize: { width: 6, height: 3 },
    },
    {
      type: 'top-articles',
      name: 'Top Articles',
      description: 'Displays most viewed articles',
      defaultConfig: { limit: 10, period: '7d' },
      defaultSize: { width: 4, height: 3 },
    },
    {
      type: 'user-segments',
      name: 'User Segments',
      description: 'Shows user behavior segments',
      defaultConfig: {},
      defaultSize: { width: 4, height: 2 },
    },
    {
      type: 'content-gaps',
      name: 'Content Gaps',
      description: 'Displays missing content opportunities',
      defaultConfig: { limit: 5 },
      defaultSize: { width: 4, height: 3 },
    },
    {
      type: 'predictions',
      name: 'Predictions',
      description: 'Shows ML predictions and forecasts',
      defaultConfig: {},
      defaultSize: { width: 6, height: 3 },
    },
    {
      type: 'engagement-patterns',
      name: 'Engagement Patterns',
      description: 'Shows when users are most engaged',
      defaultConfig: {},
      defaultSize: { width: 4, height: 2 },
    },
    {
      type: 'geographic-distribution',
      name: 'Geographic Distribution',
      description: 'Shows visitor locations',
      defaultConfig: { limit: 10 },
      defaultSize: { width: 4, height: 3 },
    },
    {
      type: 'traffic-sources',
      name: 'Traffic Sources',
      description: 'Shows where visitors come from',
      defaultConfig: { limit: 10 },
      defaultSize: { width: 4, height: 2 },
    },
    {
      type: 'custom-metric',
      name: 'Custom Metric',
      description: 'Display a custom metric or KPI',
      defaultConfig: { metric: 'views', label: 'Total Views' },
      defaultSize: { width: 2, height: 1 },
    },
  ];
}

/**
 * Duplicate dashboard
 */
export function duplicateDashboard(
  dashboardId: string,
  newName?: string
): CustomDashboard | null {
  const original = dashboardStore.get(dashboardId);
  if (!original) return null;

  const duplicate: CustomDashboard = {
    ...original,
    id: `dashboard-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name: newName || `${original.name} (Copy)`,
    createdAt: new Date(),
    updatedAt: new Date(),
    isDefault: false,
    widgets: original.widgets.map(w => ({
      ...w,
      id: `widget-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    })),
  };

  dashboardStore.set(duplicate.id, duplicate);
  return duplicate;
}

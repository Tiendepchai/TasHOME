import { create } from 'zustand';
import type { DashboardLayout, WidgetInstance } from '@/features/widgets/registry/widget-types';

interface DashboardState {
  dashboards: DashboardLayout[];
  activeDashboardId: string;
  fetchDashboards: () => Promise<void>;
  addWidget: (widgetType: string, deviceIds: string[], title?: string, colSpan?: 1 | 2 | 3, rowSpan?: 1 | 2 | 3) => void;
  removeWidget: (instanceId: string) => void;
  updateWidgetSize: (instanceId: string, colSpan?: 1 | 2 | 3, rowSpan?: 1 | 2 | 3) => void;
  updateWidget: (
    instanceId: string,
    updates: {
      title?: string;
      deviceIds?: string[];
      colSpan?: 1 | 2 | 3;
      rowSpan?: 1 | 2 | 3;
      settings?: Record<string, any>;
    }
  ) => void;
  reorderWidgets: (startIndex: number, endIndex: number) => void;
  setActiveDashboard: (id: string) => void;
  resetDefaultLayout: () => void;
}

const DEFAULT_LAYOUT: DashboardLayout = {
  id: 'main-dashboard',
  name: 'Bảng Điều Khiển Chính',
  widgets: []
};

let saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;

function saveDashboardsToServer(dashboards: DashboardLayout[]) {
  if (typeof window === 'undefined') return;
  if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
  saveDebounceTimer = setTimeout(() => {
    fetch('/api/dashboards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dashboards)
    }).catch(() => {});
  }, 250);
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
  dashboards: [DEFAULT_LAYOUT],
  activeDashboardId: 'main-dashboard',

  fetchDashboards: async () => {
    if (typeof window === 'undefined') return;
    try {
      const res = await fetch('/api/dashboards');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          const sanitized = data.map((d: DashboardLayout) => ({
            ...d,
            widgets: d.widgets.filter((w) => w.config?.widgetType !== 'device-console')
          }));
          set({ dashboards: sanitized });
        }
      }
    } catch {}
  },

  addWidget: (widgetType, deviceIds, title, colSpan = 1, rowSpan = 1) => {
    const newWidget: WidgetInstance = {
      instanceId: `w-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title,
      colSpan,
      rowSpan,
      config: {
        widgetType,
        deviceIds,
        settings: {}
      }
    };
    set((state) => {
      const dashboards = state.dashboards.map((dash) => {
        if (dash.id === state.activeDashboardId) {
          return {
            ...dash,
            widgets: [...dash.widgets, newWidget]
          };
        }
        return dash;
      });
      saveDashboardsToServer(dashboards);
      return { dashboards };
    });
  },

  removeWidget: (instanceId) => {
    set((state) => {
      const dashboards = state.dashboards.map((dash) => {
        if (dash.id === state.activeDashboardId) {
          return {
            ...dash,
            widgets: dash.widgets.filter((w) => w.instanceId !== instanceId)
          };
        }
        return dash;
      });
      saveDashboardsToServer(dashboards);
      return { dashboards };
    });
  },

  updateWidgetSize: (instanceId, colSpan, rowSpan) => {
    set((state) => {
      const dashboards = state.dashboards.map((dash) => {
        if (dash.id === state.activeDashboardId) {
          return {
            ...dash,
            widgets: dash.widgets.map((w) =>
              w.instanceId === instanceId
                ? {
                    ...w,
                    ...(colSpan !== undefined && { colSpan }),
                    ...(rowSpan !== undefined && { rowSpan })
                  }
                : w
            )
          };
        }
        return dash;
      });
      saveDashboardsToServer(dashboards);
      return { dashboards };
    });
  },

  updateWidget: (instanceId, updates) => {
    set((state) => {
      const dashboards = state.dashboards.map((dash) => {
        if (dash.id === state.activeDashboardId) {
          return {
            ...dash,
            widgets: dash.widgets.map((w) => {
              if (w.instanceId !== instanceId) return w;
              return {
                ...w,
                ...(updates.title !== undefined && { title: updates.title }),
                ...(updates.colSpan !== undefined && { colSpan: updates.colSpan }),
                ...(updates.rowSpan !== undefined && { rowSpan: updates.rowSpan }),
                ...(updates.deviceIds !== undefined || updates.settings !== undefined
                  ? {
                      config: {
                        ...w.config,
                        ...(updates.deviceIds !== undefined && { deviceIds: updates.deviceIds }),
                        ...(updates.settings !== undefined && {
                          settings: {
                            ...w.config.settings,
                            ...updates.settings
                          }
                        })
                      }
                    }
                  : {})
              };
            })
          };
        }
        return dash;
      });
      saveDashboardsToServer(dashboards);
      return { dashboards };
    });
  },

  reorderWidgets: (startIndex, endIndex) => {
    if (startIndex === endIndex) return;
    set((state) => {
      const dashboards = state.dashboards.map((dash) => {
        if (dash.id === state.activeDashboardId) {
          const list = [...dash.widgets];
          const [moved] = list.splice(startIndex, 1);
          list.splice(endIndex, 0, moved);
          return {
            ...dash,
            widgets: list
          };
        }
        return dash;
      });
      saveDashboardsToServer(dashboards);
      return { dashboards };
    });
  },

  setActiveDashboard: (id) => {
    set({ activeDashboardId: id });
  },

  resetDefaultLayout: () => {
    const dashboards = [DEFAULT_LAYOUT];
    saveDashboardsToServer(dashboards);
    set({ dashboards, activeDashboardId: 'main-dashboard' });
  }
}));

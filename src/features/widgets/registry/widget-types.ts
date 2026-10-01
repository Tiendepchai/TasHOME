import type { ComponentType } from 'react';
import type { TasmotaDevice, DeviceState, PanelEntityType } from '@/features/devices/store/device-store.types';

export interface WidgetConfig {
  widgetType: string;
  deviceIds: string[];
  settings: Record<string, any>;
}

export interface WidgetProps {
  instanceId: string;
  config: WidgetConfig;
  devices: TasmotaDevice[];
  deviceStates: Record<string, DeviceState>;
  onCommand: (deviceId: string, command: string) => Promise<any>;
  isEditing?: boolean;
  colSpan?: 1 | 2 | 3;
  rowSpan?: 1 | 2 | 3;
}

export interface WidgetDefinition {
  type: string;
  name: string;
  description: string;
  icon: string;
  defaultSize: { w: number; h: number };
  component: ComponentType<WidgetProps>;
}

export interface WidgetInstance {
  instanceId: string;
  config: WidgetConfig;
  title?: string;
  colSpan?: 1 | 2 | 3;
  rowSpan?: 1 | 2 | 3;
}

export interface DashboardLayout {
  id: string;
  name: string;
  widgets: WidgetInstance[];
}

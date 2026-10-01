import type { WidgetDefinition } from './widget-types';
import { RelayToggleWidget } from '../built-in/relay-toggle/RelayToggleWidget';
import { DeviceInfoWidget } from '../built-in/device-info/DeviceInfoWidget';
import { SensorDisplayWidget } from '../built-in/sensor-display/SensorDisplayWidget';
import { DeviceConsoleWidget } from '../built-in/console/DeviceConsoleWidget';
import { EnergyMonitorWidget } from '../built-in/energy-monitor/EnergyMonitorWidget';

export const WIDGET_REGISTRY: Record<string, WidgetDefinition> = {
  'energy-monitor': {
    type: 'energy-monitor',
    name: 'Giám sát Điện năng',
    description: 'Theo dõi công suất tiêu thụ (W), điện áp (V), dòng điện (A) và năng lượng tích lũy (kWh)',
    icon: 'Zap',
    defaultSize: { w: 2, h: 1 },
    component: EnergyMonitorWidget
  },
  'relay-toggle': {
    type: 'relay-toggle',
    name: 'Công tắc Relay',
    description: 'Bật/tắt relay, kích chuông cửa, đo độ trễ',
    icon: 'Power',
    defaultSize: { w: 1, h: 1 },
    component: RelayToggleWidget
  },
  'device-info': {
    type: 'device-info',
    name: 'Thông tin Thiết bị',
    description: 'Hiển thị IP, Firmware, Wi-Fi RSSI và Uptime',
    icon: 'Cpu',
    defaultSize: { w: 1, h: 1 },
    component: DeviceInfoWidget
  },
  'sensor-display': {
    type: 'sensor-display',
    name: 'Đo lường & Cảm biến',
    description: 'Hiển thị giá trị cảm biến, ADC analog',
    icon: 'Activity',
    defaultSize: { w: 1, h: 1 },
    component: SensorDisplayWidget
  },
  'device-console': {
    type: 'device-console',
    name: 'Tasmota Console',
    description: 'Dòng lệnh trực tiếp điều khiển thiết bị',
    icon: 'Terminal',
    defaultSize: { w: 2, h: 1 },
    component: DeviceConsoleWidget
  }
};

export function getWidgetDefinition(type: string): WidgetDefinition | undefined {
  return WIDGET_REGISTRY[type];
}

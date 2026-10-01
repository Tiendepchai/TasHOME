export type PanelEntityType = 'relay' | 'sensor' | 'energy' | 'pwm' | 'counter' | 'button' | 'switch_input' | 'adc' | 'led' | 'serial' | 'unused';

export interface GpioEntityInfo {
  gpioPin: number;
  gpioCode: number;
  gpioName: string;
  entityType: PanelEntityType;
  entityKey: string;
  controlRange?: [number, number];
}

export interface SensorReading {
  value: number | string;
  unit: string;
  lastUpdated: number;
}

export interface EnergyReading {
  voltage: number;
  current: number;
  power: number;
  apparentPower: number;
  reactivePower: number;
  factor: number;
  today: number;
  yesterday: number;
  total: number;
}

export interface WifiInfo {
  ssid: string;
  bssid?: string;
  channel?: number;
  rssi: number;
  signal: number;
  linkCount?: number;
  downtime?: string;
}

export interface DeviceState {
  online: boolean;
  lastSeen: number;
  power: Record<string, boolean>;
  sensors: Record<string, SensorReading>;
  energy?: EnergyReading;
  wifi?: WifiInfo;
  uptime?: string;
  loadAvg?: number;
  latency?: number;
  gpioConfig?: GpioEntityInfo[];
  pwm?: Record<string, number>;
  counters?: Record<string, number>;
  switches?: Record<string, boolean>;
  adc?: Record<string, number>;
  leds?: Record<string, boolean>;
}

export interface TasmotaDevice {
  id: string;
  mqttTopic: string;
  friendlyName: string;
  friendlyNames?: string[];
  relayLabels?: Record<string, string>;
  notes?: string;
  room?: string;
  ipAddress: string;
  macAddress?: string;
  firmwareVersion?: string;
  hardware?: string;
  module?: string;
  addedAt: number;
  addedVia: 'manual' | 'mqtt-discovery' | 'default';
}

export interface DeviceStoreState {
  devices: Record<string, TasmotaDevice>;
  deviceStates: Record<string, DeviceState>;
  selectedDeviceId: string | null;
  fetchDevices: () => Promise<void>;
  addDevice: (device: Omit<TasmotaDevice, 'id' | 'addedAt'>) => string;
  removeDevice: (id: string) => void;
  updateDevice: (id: string, partial: Partial<TasmotaDevice>) => void;
  updateDeviceState: (id: string, partial: Partial<DeviceState>) => void;
  setSelectedDevice: (id: string | null) => void;
}

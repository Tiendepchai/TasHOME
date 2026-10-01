import type {
  DeviceState,
  SensorReading,
  EnergyReading,
  WifiInfo,
  TasmotaDevice
} from '@/features/devices/store/device-store.types';

export function formatUptime(raw?: string | number): string {
  if (!raw || raw === 'N/A' || raw === '0') return 'N/A';

  let days = 0;
  let hours = 0;
  let mins = 0;
  let secs = 0;

  if (typeof raw === 'number') {
    days = Math.floor(raw / 86400);
    hours = Math.floor((raw % 86400) / 3600);
    mins = Math.floor((raw % 3600) / 60);
    secs = Math.floor(raw % 60);
  } else {
    // Tasmota format: "0T01:08:51" or "1T14:20:00" or "01:08:51"
    const match = String(raw).match(/^(?:(\d+)T)?(\d{1,2}):(\d{2}):(\d{2})$/);
    if (match) {
      days = parseInt(match[1] || '0', 10);
      hours = parseInt(match[2], 10);
      mins = parseInt(match[3], 10);
      secs = parseInt(match[4], 10);
    } else {
      return String(raw);
    }
  }

  if (days > 0) {
    return `${days}d ${hours}h ${mins}m`;
  }
  if (hours > 0) {
    return `${hours}h ${mins}m ${secs}s`;
  }
  return `${mins}m ${secs}s`;
}

export function guessSensorUnit(key: string): string {
  const k = key.toLowerCase();
  if (k.includes('temp')) return '°C';
  if (k.includes('hum')) return '%';
  if (k.includes('press')) return 'hPa';
  if (k.includes('volt')) return 'V';
  if (k.includes('cur') || k.includes('amp')) return 'A';
  if (k.includes('pow') || k.includes('watt')) return 'W';
  if (k.includes('energ')) return 'kWh';
  if (k.includes('rssi') || k.includes('signal')) return 'dBm';
  if (k.includes('lux') || k.includes('ill')) return 'lx';
  return '';
}

export function parsePowerState(payload: Record<string, unknown>): Record<string, boolean> {
  const power: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (/^POWER\d*$/i.test(key)) {
      const canonicalKey = key.toUpperCase();
      power[canonicalKey === 'POWER' ? 'POWER1' : canonicalKey] =
        value === 'ON' || value === 1 || value === true || String(value).toUpperCase() === 'ON';
    }
  }
  return power;
}

export function parseSensorPayload(payload: Record<string, unknown>): Record<string, SensorReading> {
  const sensors: Record<string, SensorReading> = {};
  const now = Date.now();

  for (const [key, value] of Object.entries(payload)) {
    if (key === 'Time' || key === 'TempUnit' || key === 'PressureUnit') continue;

    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const subObj = value as Record<string, unknown>;
      for (const [subKey, subVal] of Object.entries(subObj)) {
        if (typeof subVal === 'number' || typeof subVal === 'string') {
          const unit = guessSensorUnit(subKey);
          sensors[`${key}.${subKey}`] = { value: subVal, unit, lastUpdated: now };
        }
      }
    } else if (typeof value === 'number' || typeof value === 'string') {
      const unit = guessSensorUnit(key);
      sensors[key] = { value, unit, lastUpdated: now };
    }
  }
  return sensors;
}

export function parseEnergyPayload(payload: Record<string, unknown>): EnergyReading | undefined {
  const statusSNS = payload.StatusSNS as Record<string, unknown> | undefined;
  const energy = (payload.ENERGY ?? statusSNS?.ENERGY ?? payload) as Record<string, unknown> | undefined;
  if (!energy || typeof energy !== 'object') return undefined;

  if (!('Power' in energy) && !('Voltage' in energy)) return undefined;

  return {
    voltage: Number(energy.Voltage ?? 0),
    current: Number(energy.Current ?? 0),
    power: Number(energy.Power ?? 0),
    apparentPower: Number(energy.ApparentPower ?? 0),
    reactivePower: Number(energy.ReactivePower ?? 0),
    factor: Number(energy.Factor ?? 0),
    today: Number(energy.Today ?? 0),
    yesterday: Number(energy.Yesterday ?? 0),
    total: Number(energy.Total ?? 0)
  };
}

export function parseWifiInfo(payload: Record<string, unknown>): WifiInfo | undefined {
  const statusSTS = payload.StatusSTS as Record<string, unknown> | undefined;
  const wifi = (payload.Wifi ?? statusSTS?.Wifi) as Record<string, unknown> | undefined;
  if (!wifi || typeof wifi !== 'object') return undefined;

  const rawRssi = Number(wifi.RSSI ?? 0);
  const rawSignal = Number(wifi.Signal ?? 0);
  // In Tasmota, RSSI is 0-100% and Signal is dBm (negative, e.g. -36 dBm)
  const isSignalNegative = rawSignal < 0;
  const signalPct = isSignalNegative ? rawRssi : (rawSignal <= 100 ? rawSignal : rawRssi);
  const rssiDbm = isSignalNegative ? rawSignal : (rawRssi < 0 ? rawRssi : rawSignal);

  return {
    ssid: String(wifi.SSId ?? ''),
    bssid: wifi.BSSId ? String(wifi.BSSId) : undefined,
    channel: wifi.Channel ? Number(wifi.Channel) : undefined,
    rssi: rssiDbm,
    signal: Math.max(0, Math.min(100, signalPct)),
    linkCount: wifi.LinkCount ? Number(wifi.LinkCount) : undefined,
    downtime: wifi.Downtime ? String(wifi.Downtime) : undefined
  };
}

export function parseStatus0(payload: Record<string, unknown>): Partial<TasmotaDevice> & Partial<DeviceState> {
  const result: Partial<TasmotaDevice> & Partial<DeviceState> = {};

  const status = payload.Status as Record<string, unknown> | undefined;
  if (status) {
    const fn = status.FriendlyName;
    if (Array.isArray(fn) && fn.length > 0) {
      result.friendlyNames = fn.map(String);
      result.friendlyName = String(fn[0]);
    } else if (typeof fn === 'string') {
      result.friendlyName = fn;
      result.friendlyNames = [fn];
    }
    if (status.Topic) result.mqttTopic = String(status.Topic);
  }

  const net = payload.StatusNET as Record<string, unknown> | undefined;
  if (net) {
    if (net.IPAddress) result.ipAddress = String(net.IPAddress);
    if (net.Mac) result.macAddress = String(net.Mac);
  }

  const fwr = payload.StatusFWR as Record<string, unknown> | undefined;
  if (fwr) {
    if (fwr.Version) result.firmwareVersion = String(fwr.Version);
    if (fwr.Hardware) result.hardware = String(fwr.Hardware);
  }

  const mod = payload.StatusMQT as Record<string, unknown> | undefined;
  if (payload.Module) result.module = String(payload.Module);

  const sts = (payload.StatusSTS ?? payload) as Record<string, unknown>;
  const powerParsed = parsePowerState(sts);
  result.power = powerParsed;

  const wifiParsed = parseWifiInfo(payload);
  if (wifiParsed) result.wifi = wifiParsed;

  if (sts.Uptime) result.uptime = String(sts.Uptime);
  if (sts.LoadAvg !== undefined) result.loadAvg = Number(sts.LoadAvg);

  const sns = (payload.StatusSNS ?? payload) as Record<string, unknown>;
  const sensorParsed = parseSensorPayload(sns);
  if (Object.keys(sensorParsed).length > 0) result.sensors = sensorParsed;

  const energyParsed = parseEnergyPayload(payload);
  if (energyParsed) result.energy = energyParsed;

  if (payload._latency !== undefined) {
    result.latency = Number(payload._latency);
  }

  return result;
}

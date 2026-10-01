import net from 'node:net';
import { tasmotaHttp } from '../../core/http/tasmota-http-client.js';
import { CONFIG, TASMOTA_DEFAULTS } from '../../core/config/constants.js';

export class DeviceStore {
  constructor() {
    this.devices = {
      default: {
        id: 'default',
        friendlyName: 'SmartHome Relay',
        friendlyNames: ['Relay Đèn', 'Chuông Westminster'],
        relayLabels: {
          POWER1: 'Relay Đèn (TuyaMCU DP1)',
          POWER2: 'Chuông Âm Báo (TuyaMCU DP2)',
        },
        ipAddress: CONFIG.RELAY_HOST,
        macAddress: '60:01:94:0F:16:4B',
        firmwareVersion: '15.6.0 (release-tasmota)',
        hardware: 'ESP8266EX + STM32F103',
        module: 'TuyaMCU (54)',
        addedAt: Date.now(),
      }
    };

    this.deviceStates = {
      default: {
        online: false,
        lastSeen: 0,
        power: {
          POWER1: false,
          POWER2: false,
        },
        wifi: {
          ssid: 'Ca Cam Meo Meo',
          channel: 3,
          rssi: 100,
          signal: -36,
        },
        uptime: '0T00:00:00',
        loadAvg: 0,
        latency: 0,
        protocol: 'Tasmota (TuyaMCU)',
      }
    };

    this.pollTimer = null;
  }

  getDevice(id = 'default') {
    return this.devices[id] || null;
  }

  getDeviceState(id = 'default') {
    return this.deviceStates[id] || null;
  }

  updateDevice(id, partial) {
    if (this.devices[id]) {
      this.devices[id] = { ...this.devices[id], ...partial };
    }
  }

  updateDeviceState(id, partial) {
    if (this.deviceStates[id]) {
      this.deviceStates[id] = {
        ...this.deviceStates[id],
        ...partial,
        power: {
          ...this.deviceStates[id].power,
          ...(partial.power || {})
        },
        wifi: {
          ...this.deviceStates[id].wifi,
          ...(partial.wifi || {})
        }
      };
    }
  }

  // Legacy MinhHa socket fallback
  requestLegacy(body = null) {
    return new Promise((resolve, reject) => {
      const t0 = Date.now();
      const socket = new net.Socket();
      let data = '';

      socket.setTimeout(CONFIG.HTTP_TIMEOUT);
      socket.connect(CONFIG.RELAY_PORT, CONFIG.RELAY_HOST, () => {
        if (body) {
          const payload = `POST / HTTP/1.0\r\nHost: ${CONFIG.RELAY_HOST}\r\nContent-Type: application/x-www-form-urlencoded\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`;
          socket.write(payload);
        } else {
          const payload = `GET / HTTP/1.0\r\nHost: ${CONFIG.RELAY_HOST}\r\nConnection: close\r\n\r\n`;
          socket.write(payload);
        }
      });

      socket.on('data', chunk => { data += chunk.toString(); });
      socket.on('end', () => {
        const latency = Date.now() - t0;
        let p1 = false;
        if (data.includes('name="RLON"') || data.includes('RELAY OFF')) p1 = true;
        if (data.includes('name="RLOF"') || data.includes('RELAY ON')) p1 = false;
        resolve({ power1: p1, latency, raw: data });
      });

      socket.on('timeout', () => {
        socket.destroy();
        reject(new Error('Legacy relay timeout'));
      });

      socket.on('error', err => reject(err));
    });
  }

  async syncDevice(id = 'default') {
    const dev = this.getDevice(id);
    if (!dev) return null;

    try {
      // 1. Tasmota Status 11 (STS: Power, Wifi, Uptime)
      const res = await tasmotaHttp.sendCommand(dev.ipAddress, 'Status 11');
      if (res.ok && res.data?.StatusSTS) {
        const sts = res.data.StatusSTS;
        const p1 = (sts.POWER1 === 'ON' || sts.POWER === 'ON');
        const p2 = (sts.POWER2 === 'ON');

        this.updateDeviceState(id, {
          online: true,
          lastSeen: Date.now(),
          power: { POWER1: p1, POWER2: p2 },
          wifi: {
            ssid: sts.Wifi?.SSId || 'Connected',
            channel: sts.Wifi?.Channel || 1,
            rssi: sts.Wifi?.RSSI || 100,
            signal: sts.Wifi?.Signal || -50,
          },
          uptime: sts.Uptime || 'Online',
          loadAvg: sts.LoadAvg || 0,
          latency: res.latency,
          protocol: 'Tasmota (TuyaMCU)',
        });
        return this.getDeviceState(id);
      }
    } catch (tasmotaErr) {
      // 2. Fallback to Legacy MinhHa AT Driver
      try {
        const legRes = await this.requestLegacy();
        this.updateDeviceState(id, {
          online: true,
          lastSeen: Date.now(),
          power: { POWER1: legRes.power1, POWER2: false },
          latency: legRes.latency,
          protocol: 'Legacy MinhHa',
        });
        return this.getDeviceState(id);
      } catch (legErr) {
        this.updateDeviceState(id, {
          online: false,
          latency: 0,
        });
        throw tasmotaErr;
      }
    }

    return this.getDeviceState(id);
  }

  async togglePower(id = 'default', relayIndex = 1) {
    const dev = this.getDevice(id);
    const curState = this.getDeviceState(id);
    if (!dev) throw new Error('Device not found');

    if (curState.protocol === 'Legacy MinhHa') {
      const curP1 = curState.power.POWER1;
      const payload = curP1 ? 'RLON=RELAY OFF' : 'RLOF=RELAY ON';
      const legRes = await this.requestLegacy(payload);
      this.updateDeviceState(id, {
        power: { POWER1: legRes.power1 },
        latency: legRes.latency,
        lastSeen: Date.now(),
      });
      return this.getDeviceState(id);
    }

    // Tasmota command: Power<x> TOGGLE
    const res = await tasmotaHttp.setPower(dev.ipAddress, relayIndex, 'TOGGLE');
    if (res.ok && res.data) {
      const key = `POWER${relayIndex}`;
      const isON = (res.data[key] === 'ON' || (relayIndex === 1 && res.data.POWER === 'ON'));
      this.updateDeviceState(id, {
        power: { [key]: isON },
        latency: res.latency,
        lastSeen: Date.now(),
      });
    }
    return this.getDeviceState(id);
  }

  async triggerChime(id = 'default') {
    const dev = this.getDevice(id);
    if (!dev) throw new Error('Device not found');

    const res = await tasmotaHttp.triggerChime(dev.ipAddress);
    if (res.ok) {
      this.updateDeviceState(id, {
        latency: res.latency,
        lastSeen: Date.now(),
      });
    }
    return this.getDeviceState(id);
  }

  startPolling(intervalMs = CONFIG.POLL_INTERVAL_MS) {
    if (this.pollTimer) clearInterval(this.pollTimer);
    // Initial fetch
    this.syncDevice().catch(() => {});
    this.pollTimer = setInterval(() => {
      this.syncDevice().catch(() => {});
    }, intervalMs);
  }

  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }
}

export const deviceStore = new DeviceStore();

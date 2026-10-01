import { tasmotaHttp } from './tasmota-http-client';
import { parseStatus0, parsePulseTimeResponse, parseTimersResponse } from '@/shared/utils/tasmota-parsers';
import { mapGpioToEntities } from '@/shared/utils/gpio-entity-mapper';
import { useDeviceStore } from '@/features/devices/store/device-store';
import { TASMOTA_DEFAULTS } from '../config/constants';

class HttpPollScheduler {
  private bgTimer: ReturnType<typeof setInterval> | null = null;
  private activeTimer: ReturnType<typeof setInterval> | null = null;
  private activeDeviceId: string | null = null;
  private paused = false;
  private gpioFetched = new Set<string>();
  private timersFetched = new Set<string>();

  start() {
    this.stop();
    if (typeof window !== 'undefined') {
      document.addEventListener('visibilitychange', this.onVisibilityChange);
    }
    this.pollAll();
    this.bgTimer = setInterval(() => {
      if (!this.paused) this.pollAll();
    }, TASMOTA_DEFAULTS.BG_POLL_INTERVAL_MS);
  }

  stop() {
    if (this.bgTimer) clearInterval(this.bgTimer);
    if (this.activeTimer) clearInterval(this.activeTimer);
    this.bgTimer = null;
    this.activeTimer = null;
    if (typeof window !== 'undefined') {
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
    }
  }

  startActive(deviceId: string) {
    this.activeDeviceId = deviceId;
    if (this.activeTimer) clearInterval(this.activeTimer);
    this.pollDevice(deviceId);
    this.activeTimer = setInterval(() => {
      if (!this.paused && this.activeDeviceId) {
        this.pollDevice(this.activeDeviceId);
      }
    }, TASMOTA_DEFAULTS.ACTIVE_POLL_INTERVAL_MS);
  }

  stopActive() {
    if (this.activeTimer) clearInterval(this.activeTimer);
    this.activeTimer = null;
    this.activeDeviceId = null;
  }

  async pollNow(deviceId?: string): Promise<void> {
    if (deviceId) {
      await this.pollDevice(deviceId);
    } else {
      await this.pollAll();
    }
  }

  private onVisibilityChange = () => {
    if (typeof document === 'undefined') return;
    this.paused = document.hidden;
    if (!this.paused) {
      this.pollAll();
      if (this.activeDeviceId) this.pollDevice(this.activeDeviceId);
    }
  };

  private async pollAll() {
    const { devices } = useDeviceStore.getState();
    const list = Object.values(devices);
    await Promise.allSettled(list.map((d) => this.pollDevice(d.id)));
  }

  private async pollDevice(deviceId: string) {
    const { devices, updateDevice, updateDeviceState } = useDeviceStore.getState();
    const dev = devices[deviceId];
    if (!dev || !dev.ipAddress) return;

    try {
      const res = await tasmotaHttp.getFullStatus(dev.ipAddress);
      if (!res.ok) {
        updateDeviceState(deviceId, { online: false, lastSeen: Date.now() });
        return;
      }

      const parsed = parseStatus0(res.data);
      const {
        friendlyName,
        macAddress,
        firmwareVersion,
        hardware,
        module: mod,
        ...statePatch
      } = parsed;

      const metaPatch: Record<string, unknown> = {};
      if (friendlyName && !dev.friendlyName) metaPatch.friendlyName = friendlyName;
      if (macAddress && macAddress !== dev.macAddress) metaPatch.macAddress = macAddress;
      if (firmwareVersion && firmwareVersion !== dev.firmwareVersion) metaPatch.firmwareVersion = firmwareVersion;
      if (hardware && hardware !== dev.hardware) metaPatch.hardware = hardware;
      if (mod && mod !== dev.module) metaPatch.module = mod;

      if (Object.keys(metaPatch).length > 0) {
        updateDevice(deviceId, metaPatch);
      }

      updateDeviceState(deviceId, {
        online: true,
        lastSeen: Date.now(),
        ...statePatch
      });

      if (!this.gpioFetched.has(deviceId)) {
        this.gpioFetched.add(deviceId);
        tasmotaHttp.sendCommand(dev.ipAddress, 'GPIO 255')
          .then((gpioRes) => {
            if (gpioRes.ok) {
              const gpioConfig = mapGpioToEntities(gpioRes.data);
              if (gpioConfig.length > 0) {
                updateDeviceState(deviceId, { gpioConfig });
              }
            }
          })
          .catch(() => this.gpioFetched.delete(deviceId));
      }

      if (!this.timersFetched.has(deviceId)) {
        this.timersFetched.add(deviceId);
        Promise.allSettled([
          tasmotaHttp.sendCommand(dev.ipAddress, 'PulseTime1'),
          tasmotaHttp.sendCommand(dev.ipAddress, 'PulseTime2'),
          tasmotaHttp.sendCommand(dev.ipAddress, 'Timers')
        ]).then(([p1, p2, tm]) => {
          const patch: Record<string, unknown> = {};
          const pulseTimes: Record<string, unknown> = {};
          if (p1.status === 'fulfilled' && p1.value.ok) {
            Object.assign(pulseTimes, parsePulseTimeResponse(p1.value.data));
          }
          if (p2.status === 'fulfilled' && p2.value.ok) {
            Object.assign(pulseTimes, parsePulseTimeResponse(p2.value.data));
          }
          if (Object.keys(pulseTimes).length > 0) {
            patch.pulseTimes = pulseTimes;
          }
          if (tm.status === 'fulfilled' && tm.value.ok) {
            const parsedTimers = parseTimersResponse(tm.value.data);
            patch.timers = parsedTimers.timers;
            patch.timersEnabled = parsedTimers.timersEnabled;
          }
          if (Object.keys(patch).length > 0) {
            updateDeviceState(deviceId, patch);
          }
        }).catch(() => this.timersFetched.delete(deviceId));
      }
    } catch (err) {
      updateDeviceState(deviceId, { online: false, lastSeen: Date.now() });
    }
  }
}

export const pollScheduler = new HttpPollScheduler();

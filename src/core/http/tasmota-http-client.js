import { HttpError, HTTP_ERROR_TYPES } from './types.js';
import { TASMOTA_DEFAULTS } from '../config/constants.js';

function isPrivateIp(ipOrHost) {
  const host = ipOrHost.split(':')[0].split('/')[0];
  return /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.|localhost|127\.0\.0\.1)/.test(host);
}

function proxyUrl(ip, path) {
  return `/device-proxy/${ip}${path}`;
}

export class TasmotaHttpClient {
  constructor(defaultTimeout = TASMOTA_DEFAULTS.HTTP_TIMEOUT) {
    this.defaultTimeout = defaultTimeout;
  }

  buildUrl(ip, command, auth) {
    const cleanHost = ip.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const params = new URLSearchParams({ cmnd: command });
    if (auth?.username) params.set('user', auth.username);
    if (auth?.password) params.set('password', auth.password);

    if (typeof window !== 'undefined' && isPrivateIp(cleanHost)) {
      return proxyUrl(cleanHost, `/cm?${params.toString()}`);
    }
    return `http://${cleanHost}/cm?${params.toString()}`;
  }

  async sendCommand(ip, command, auth = null, timeout = this.defaultTimeout) {
    const start = Date.now();
    const url = this.buildUrl(ip, command, auth);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal
      });

      const latency = Date.now() - start;
      const text = await response.text();

      if (response.status === 401) {
        throw new HttpError(HTTP_ERROR_TYPES.AUTH, 'Unauthorized: check device password', 401);
      }
      if (response.status >= 500) {
        throw new HttpError(HTTP_ERROR_TYPES.SERVER, `Device server error ${response.status}`, response.status);
      }

      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new HttpError(HTTP_ERROR_TYPES.PARSE, `Invalid JSON response: ${text.slice(0, 100)}`);
      }

      return {
        ok: response.ok,
        data: { ...data, _latency: latency },
        status: response.status,
        timestamp: Date.now()
      };
    } catch (err) {
      if (err instanceof HttpError) throw err;
      if (err.name === 'AbortError') {
        throw new HttpError(HTTP_ERROR_TYPES.TIMEOUT, `Request to ${ip} timed out after ${timeout}ms`);
      }
      const msg = err.message || String(err);
      if (msg.toLowerCase().includes('cors') || msg.toLowerCase().includes('fetch')) {
        throw new HttpError(HTTP_ERROR_TYPES.CORS, `CORS blocked for ${ip}. Ensure proxy is active or SetOption120 1.`);
      }
      throw new HttpError(HTTP_ERROR_TYPES.NETWORK, `Network error: ${msg}`);
    } finally {
      clearTimeout(timer);
    }
  }

  async getFullStatus(ip, auth = null) {
    return this.sendCommand(ip, 'STATUS 0', auth);
  }

  async getStatus(ip, type = 0, auth = null, timeout = this.defaultTimeout) {
    return this.sendCommand(ip, `Status ${type}`, auth, timeout);
  }

  async getSensorStatus(ip, auth = null) {
    return this.sendCommand(ip, 'STATUS 8', auth);
  }

  async togglePower(ip, index = 1, auth = null) {
    return this.sendCommand(ip, `POWER${index} TOGGLE`, auth);
  }

  async setPower(ip, index = 1, on = true, auth = null) {
    return this.sendCommand(ip, `POWER${index} ${on ? 'ON' : 'OFF'}`, auth);
  }

  async triggerChime(ip, chimeIndex = 2, auth = null) {
    return this.sendCommand(ip, `Backlog POWER${chimeIndex} ON; Delay 3; POWER${chimeIndex} OFF`, auth);
  }
}

export const tasmotaHttp = new TasmotaHttpClient();

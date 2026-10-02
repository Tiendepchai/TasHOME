import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { CONFIG } from './src/core/config/constants.js';
import { tasmotaHttp } from './src/core/http/tasmota-http-client.js';
import { deviceStore } from './src/features/devices/device-store.js';
import {
  base32Decode,
  base32Encode,
  generateTOTP,
  verifyTOTP,
  loadOrGenTotpSecret,
  revokeTotpSecret,
  getTotpSecret,
  getFormattedSecret,
  getOtpAuthUrl,
  createSessionToken,
  verifySessionToken,
  isAuthenticated,
  checkRateLimit,
  recordLoginAttempt
} from './src/core/auth/index.js';
import { renderDashboardHtml } from './src/features/dashboard/views/dashboard-view.js';
import { renderLoginHtml } from './src/features/dashboard/views/login-view.js';

function readBodyJSON(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (c) => body += c);
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch {
        resolve({});
      }
    });
  });
}

// Simulated Tasmota fallback for offline local testing / demo mode
let simPower1 = true;
let simPower2 = false;

function getSimulatedTasmotaResponse(rawCmnd, ip) {
  const cmnd = (rawCmnd || '').trim();
  const upper = cmnd.toUpperCase();

  if (upper === 'POWER1 TOGGLE') {
    simPower1 = !simPower1;
    return { POWER1: simPower1 ? 'ON' : 'OFF' };
  }
  if (upper === 'POWER1 ON') {
    simPower1 = true;
    return { POWER1: 'ON' };
  }
  if (upper === 'POWER1 OFF') {
    simPower1 = false;
    return { POWER1: 'OFF' };
  }
  if (upper === 'POWER2 TOGGLE') {
    simPower2 = !simPower2;
    return { POWER2: simPower2 ? 'ON' : 'OFF' };
  }
  if (upper === 'POWER2 ON') {
    simPower2 = true;
    return { POWER2: 'ON' };
  }
  if (upper === 'POWER2 OFF') {
    simPower2 = false;
    return { POWER2: 'OFF' };
  }
  if (upper.startsWith('PULSETIME')) {
    const key = upper.split(' ')[0] || 'PulseTime1';
    return { [key]: { Set: 600, Remaining: 540 } };
  }
  if (upper.startsWith('BACKLOG')) {
    return { Message: 'Backlog executed' };
  }
  if (upper === 'TIMERS') {
    return { Timers: 'OFF', Timer1: { Arm: 0, Mode: 0, Time: '00:00', Window: 0, Days: '1111111', Repeat: 0, Output: 1, Action: 1 } };
  }
  if (upper === 'GPIO 255') {
    return { GPIO: { '12': { Relay: 1 }, '14': { Relay: 2 }, '4': { Button: 1 }, '5': { Button: 2 } } };
  }

  // Status 0 / Status 11 / Status
  return {
    Status: {
      Module: 54,
      DeviceName: 'TasHOME Relay',
      FriendlyName: ['Đèn bàn làm việc', 'Chuông cửa'],
      Topic: 'tasmota',
      Power: simPower1 ? 1 : 0
    },
    StatusPRM: {
      Uptime: '3T14:22:15',
      StartupUTC: '2026-09-28T07:43:43',
      Sleep: 50,
      BootCount: 12
    },
    StatusFWR: {
      Version: '15.6.0 (release-tasmota)',
      BuildDateTime: '2026-08-15T12:00:00',
      Hardware: 'ESP8266EX'
    },
    StatusNET: {
      Hostname: 'tashome-relay',
      IPAddress: ip || '192.168.1.140',
      Gateway: '192.168.1.1',
      Mac: '60:01:94:0F:16:4B'
    },
    StatusSNS: {
      Time: new Date().toISOString(),
      ENERGY: {
        TotalStartTime: '2026-09-01T00:00:00',
        Total: 24.85,
        Yesterday: 1.42,
        Today: 0.86,
        Period: 12,
        Power: simPower1 ? 48.5 : 0,
        ApparentPower: simPower1 ? 52.1 : 0,
        ReactivePower: simPower1 ? 18.9 : 0,
        Factor: simPower1 ? 0.93 : 1.0,
        Voltage: 226.4,
        Current: simPower1 ? 0.231 : 0
      }
    },
    StatusSTS: {
      Time: new Date().toISOString(),
      Uptime: '3T14:22:15',
      UptimeSec: 310935,
      Heap: 24,
      LoadAvg: 19,
      POWER1: simPower1 ? 'ON' : 'OFF',
      POWER2: simPower2 ? 'ON' : 'OFF',
      Wifi: {
        AP: 1,
        SSId: 'Ca Cam Meo Meo',
        BSSId: 'C4:AD:34:2E:8F:A1',
        Channel: 6,
        RSSI: 88,
        Signal: -56,
        LinkCount: 1
      }
    }
  };
}

// --- Server Storage Engine (Atomic JSON in data/) ---
const DATA_DIR = path.resolve('data');
if (!fs.existsSync(DATA_DIR)) {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {}
}

const DEVICES_FILE = path.join(DATA_DIR, 'devices.json');
const DASHBOARDS_FILE = path.join(DATA_DIR, 'dashboards.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const SCENES_FILE = path.join(DATA_DIR, 'scenes.json');

const DEFAULT_SCENES = [
  {
    id: 'scene-all-on',
    name: 'Bật Tất Cả',
    description: 'Bật toàn bộ công tắc và đèn trong nhà',
    icon: 'Power',
    actions: [{ type: 'broadcast', command: 'POWER1 ON' }]
  },
  {
    id: 'scene-all-off',
    name: 'Tắt Tất Cả',
    description: 'Tắt toàn bộ thiết bị đang bật',
    icon: 'ZapOff',
    actions: [{ type: 'broadcast', command: 'POWER1 OFF' }]
  },
  {
    id: 'scene-doorbell',
    name: 'Kích Chuông Cửa',
    description: 'Kích xung chuông cửa thông minh 300ms',
    icon: 'Bell',
    actions: [{ type: 'broadcast', command: 'Backlog POWER2 ON; Delay 3; POWER2 OFF' }]
  }
];

function saveJsonAtomic(filePath, data) {
  const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmpPath, filePath);
}

function loadJson(filePath, defaultValue) {
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(raw);
    }
  } catch {}
  return defaultValue;
}

// Migrate legacy root files if present
if (!fs.existsSync(DEVICES_FILE) && fs.existsSync(path.resolve('.devices.json'))) {
  try { fs.copyFileSync(path.resolve('.devices.json'), DEVICES_FILE); } catch {}
}
if (!fs.existsSync(DASHBOARDS_FILE) && fs.existsSync(path.resolve('.dashboards.json'))) {
  try { fs.copyFileSync(path.resolve('.dashboards.json'), DASHBOARDS_FILE); } catch {}
}

// Seed default scenes if data/scenes.json does not exist
if (!fs.existsSync(SCENES_FILE)) {
  try {
    saveJsonAtomic(SCENES_FILE, DEFAULT_SCENES);
  } catch {}
}

function detectLocalSubnet(explicitSubnet) {
  if (explicitSubnet) {
    const clean = explicitSubnet.trim().replace(/^https?:\/\//, '').split('/')[0];
    const parts = clean.split('.');
    if (parts.length >= 3) {
      const s0 = parseInt(parts[0], 10);
      const s1 = parseInt(parts[1], 10);
      const s2 = parseInt(parts[2], 10);
      if (s0 >= 0 && s0 <= 255 && s1 >= 0 && s1 <= 255 && s2 >= 0 && s2 <= 255) {
        return `${s0}.${s1}.${s2}`;
      }
    }
  }
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal && net.address !== '127.0.0.1') {
        const parts = net.address.split('.');
        if (parts.length === 4) {
          return `${parts[0]}.${parts[1]}.${parts[2]}`;
        }
      }
    }
  }
  if (CONFIG.RELAY_HOST && CONFIG.RELAY_HOST.includes('.')) {
    const parts = CONFIG.RELAY_HOST.split('.');
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.${parts[2]}`;
    }
  }
  return '192.168.1';
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // 1. 2FA TOTP Login (RFC 6238, 24-hour session cookie)
  if (req.method === 'POST' && url.pathname === '/api/auth/login') {
    const rateErr = checkRateLimit();
    if (rateErr) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: rateErr }));
    }

    const { pin } = await readBodyJSON(req);
    const code = String(pin || '').trim();
    const isTotp = verifyTOTP(code);

    if (isTotp) {
      recordLoginAttempt(true);
      const token = createSessionToken();
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Set-Cookie': `smarthome_session=${token}; HttpOnly; SameSite=Lax; Max-Age=${CONFIG.SESSION_MAX_AGE_SEC}; Path=/`
      });
      return res.end(JSON.stringify({ success: true, method: '2fa' }));
    } else {
      recordLoginAttempt(false);
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: 'Mã 2FA không đúng' }));
    }
  }

  // 2. Logout (Cookie revocation)
  if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Set-Cookie': `smarthome_session=; HttpOnly; SameSite=Lax; Max-Age=0; Path=/`
    });
    return res.end(JSON.stringify({ success: true }));
  }

  // 3. Static assets & SPA routing from dist/
  const distDir = path.resolve('dist');
  const cleanPath = url.pathname.replace(/^\/+/, '');
  const candidateFile = path.join(distDir, cleanPath || 'index.html');

  if ((req.method === 'GET' || req.method === 'HEAD') && fs.existsSync(candidateFile) && fs.statSync(candidateFile).isFile()) {
    const ext = path.extname(candidateFile).toLowerCase();
    const mimeMap = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.ico': 'image/x-icon',
      '.json': 'application/json'
    };
    res.writeHead(200, { 'Content-Type': mimeMap[ext] || 'application/octet-stream' });
    if (req.method === 'HEAD') return res.end();
    return res.end(fs.readFileSync(candidateFile));
  }

  // 4. Device proxy endpoint for SPA
  const proxyMatch = url.pathname.match(/^\/device-proxy\/([^/?]+)(\/[^?]*)?$/);
  if (proxyMatch) {
    if (!isAuthenticated(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Unauthorized' }));
    }
    const deviceIp = proxyMatch[1];
    const targetPath = (proxyMatch[2] || '/') + url.search;
    try {
      const upstream = await fetch(`http://${deviceIp}${targetPath}`, {
        method: req.method,
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(800)
      });
      const data = await upstream.arrayBuffer();
      res.writeHead(upstream.status, {
        'Content-Type': upstream.headers.get('Content-Type') || 'application/json',
        'Access-Control-Allow-Origin': '*'
      });
      return res.end(Buffer.from(data));
    } catch (err) {
      const cmnd = url.searchParams.get('cmnd') || '';
      const sim = getSimulatedTasmotaResponse(cmnd, deviceIp);
      if (sim) {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        });
        return res.end(JSON.stringify(sim));
      }
      res.writeHead(502, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Proxy failed', detail: err.message }));
    }
  }

  // 5. Fallback Root Route (Legacy renderer if dist is absent)
  if ((req.method === 'GET' || req.method === 'HEAD') && url.pathname === '/') {
    const authorized = isAuthenticated(req);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    if (req.method === 'HEAD') return res.end();
    return res.end(authorized ? renderDashboardHtml(CONFIG.RELAY_HOST) : renderLoginHtml());
  }

  // PROTECTED ENDPOINTS (Requires valid 24h HMAC session token)
  if (!isAuthenticated(req)) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Unauthorized' }));
  }

  // 4. 2FA Management API
  if (req.method === 'GET' && url.pathname === '/api/auth/2fa') {
    const now = Date.now();
    const secret = getTotpSecret();
    const curCode = generateTOTP(secret, now);
    const remaining = 30 - Math.floor((now / 1000) % 30);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      secret,
      formatted: getFormattedSecret(secret),
      otpauth: getOtpAuthUrl(secret),
      currentCode: curCode,
      remaining,
      sessionTtlHours: 24
    }));
  }

  // 5. Revoke 2FA Key API
  if (req.method === 'POST' && url.pathname === '/api/auth/revoke-key') {
    const newKey = revokeTotpSecret();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      success: true,
      message: 'Đã thu hồi và tạo khóa 2FA mới',
      ...newKey
    }));
  }

  // 6. Dashboards Layout Persistence API
  if (req.method === 'GET' && url.pathname === '/api/dashboards') {
    const dashboards = loadJson(DASHBOARDS_FILE, [
      { id: 'main-dashboard', name: 'Bảng Điều Khiển Chính', widgets: [] }
    ]);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(dashboards));
  }

  if ((req.method === 'POST' || req.method === 'PUT') && url.pathname === '/api/dashboards') {
    try {
      const data = await readBodyJSON(req);
      const dashboards = Array.isArray(data) ? data : data.dashboards || [];
      saveJsonAtomic(DASHBOARDS_FILE, dashboards);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: err.message }));
    }
  }

  // 6.5 Settings Persistence API
  if (req.method === 'GET' && url.pathname === '/api/settings') {
    const settings = loadJson(SETTINGS_FILE, { theme: 'dark' });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(settings));
  }

  if (req.method === 'POST' && url.pathname === '/api/settings') {
    try {
      const data = await readBodyJSON(req);
      const current = loadJson(SETTINGS_FILE, { theme: 'dark' });
      const nextSettings = { ...current, ...data };
      saveJsonAtomic(SETTINGS_FILE, nextSettings);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, settings: nextSettings }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: err.message }));
    }
  }

  // 7. ASTRA Devices Registry API (Full CRUD)
  const deviceDetailMatch = url.pathname.match(/^\/api\/devices\/([^/?]+)$/);

  if (req.method === 'GET' && url.pathname === '/api/devices') {
    const devices = loadJson(DEVICES_FILE, {});
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(devices));
  }

  if (req.method === 'POST' && url.pathname === '/api/devices') {
    try {
      const data = await readBodyJSON(req);
      const devices = loadJson(DEVICES_FILE, {});

      // Batch save
      if (data && typeof data === 'object' && !data.ipAddress) {
        saveJsonAtomic(DEVICES_FILE, data);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, count: Object.keys(data).length }));
      }

      // Single device creation
      const id = data.id || `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const newDevice = {
        ...data,
        id,
        addedAt: data.addedAt || Date.now()
      };
      devices[id] = newDevice;
      saveJsonAtomic(DEVICES_FILE, devices);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, device: newDevice }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: err.message }));
    }
  }

  if (req.method === 'PUT' && deviceDetailMatch) {
    const devId = deviceDetailMatch[1];
    try {
      const patch = await readBodyJSON(req);
      const devices = loadJson(DEVICES_FILE, {});
      if (!devices[devId]) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'Thiết bị không tồn tại' }));
      }
      devices[devId] = { ...devices[devId], ...patch };
      saveJsonAtomic(DEVICES_FILE, devices);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, device: devices[devId] }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: err.message }));
    }
  }

  if (req.method === 'DELETE' && deviceDetailMatch) {
    const devId = deviceDetailMatch[1];
    try {
      const devices = loadJson(DEVICES_FILE, {});
      if (devices[devId]) {
        delete devices[devId];
        saveJsonAtomic(DEVICES_FILE, devices);
      }

      // Cascade remove or unlink from dashboards widgets
      const dashboards = loadJson(DASHBOARDS_FILE, []);
      let dashChanged = false;
      const updatedDashboards = dashboards.map((dash) => {
        const nextWidgets = dash.widgets.map((w) => {
          if (w.config?.deviceIds?.includes(devId)) {
            dashChanged = true;
            return {
              ...w,
              config: {
                ...w.config,
                deviceIds: w.config.deviceIds.filter((id) => id !== devId)
              }
            };
          }
          return w;
        });
        return { ...dash, widgets: nextWidgets };
      });

      if (dashChanged) {
        saveJsonAtomic(DASHBOARDS_FILE, updatedDashboards);
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, deletedId: devId }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: err.message }));
    }
  }

  // P3: Network Auto-Discovery API
  if (req.method === 'GET' && url.pathname === '/api/devices/discover') {
    try {
      const subnetParam = url.searchParams.get('subnet');
      const subnet = detectLocalSubnet(subnetParam);
      const existingDevices = loadJson(DEVICES_FILE, {});
      const existingList = Object.values(existingDevices);

      const discovered = [];
      const BATCH_SIZE = 20;

      for (let startIp = 1; startIp <= 254; startIp += BATCH_SIZE) {
        const endIp = Math.min(startIp + BATCH_SIZE - 1, 254);
        const batchPromises = [];

        for (let i = startIp; i <= endIp; i++) {
          const ip = `${subnet}.${i}`;
          batchPromises.push(
            (async () => {
              try {
                const res = await fetch(`http://${ip}/cm?cmnd=Status%200`, {
                  signal: AbortSignal.timeout(300)
                });
                if (!res.ok) return;
                const text = await res.text();
                const data = JSON.parse(text);

                const friendlyName =
                  data?.Status?.DeviceName ||
                  (Array.isArray(data?.Status?.FriendlyName) ? data?.Status?.FriendlyName[0] : data?.Status?.FriendlyName) ||
                  data?.StatusNET?.Hostname ||
                  `Tasmota-${ip.split('.').pop()}`;
                const macAddress = data?.StatusNET?.Mac || '';
                const module = data?.Status?.Module || data?.Status?.DeviceName || '';
                const hardware = data?.StatusFWR?.Hardware || data?.StatusSTS?.Wifi?.Chip || 'ESP8266';
                const firmwareVersion = data?.StatusFWR?.Version || '';

                const alreadyAdded = existingList.some(
                  (d) => d.ipAddress === ip || (macAddress && d.macAddress && d.macAddress === macAddress)
                );

                discovered.push({
                  ipAddress: ip,
                  friendlyName,
                  macAddress,
                  module,
                  hardware,
                  firmwareVersion,
                  alreadyAdded
                });
              } catch {}
            })()
          );
        }
        await Promise.all(batchPromises);
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: true,
        subnet,
        count: discovered.length,
        devices: discovered
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: err.message }));
    }
  }

  // P4: Scenes & Quick Presets API
  const sceneExecMatch = url.pathname.match(/^\/api\/scenes\/([^/?]+)\/execute$/);
  const sceneDetailMatch = url.pathname.match(/^\/api\/scenes\/([^/?]+)$/);

  if (req.method === 'GET' && url.pathname === '/api/scenes') {
    const scenes = loadJson(SCENES_FILE, DEFAULT_SCENES);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(scenes));
  }

  if (req.method === 'POST' && url.pathname === '/api/scenes') {
    try {
      const body = await readBodyJSON(req);
      const scenes = loadJson(SCENES_FILE, DEFAULT_SCENES);
      const id = body.id || `scene-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const newScene = {
        id,
        name: body.name || 'Ngữ cảnh mới',
        description: body.description || '',
        icon: body.icon || 'Sparkles',
        actions: Array.isArray(body.actions) && body.actions.length > 0
          ? body.actions
          : [{ type: 'broadcast', command: body.command || 'POWER1 TOGGLE' }]
      };
      const idx = scenes.findIndex((s) => s.id === id);
      if (idx >= 0) {
        scenes[idx] = newScene;
      } else {
        scenes.push(newScene);
      }
      saveJsonAtomic(SCENES_FILE, scenes);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, scene: newScene }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: err.message }));
    }
  }

  if (req.method === 'POST' && sceneExecMatch) {
    const sceneId = sceneExecMatch[1];
    try {
      const scenes = loadJson(SCENES_FILE, DEFAULT_SCENES);
      const scene = scenes.find((s) => s.id === sceneId);
      if (!scene) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'Ngữ cảnh không tồn tại' }));
      }

      const devicesObj = loadJson(DEVICES_FILE, {});
      const deviceList = Object.values(devicesObj);
      let executedCount = 0;

      for (const action of scene.actions || []) {
        const cmd = action.command;
        if (!cmd) continue;

        if (action.type === 'broadcast' || !action.type) {
          const promises = deviceList.map((dev) =>
            tasmotaHttp.sendCommand(dev.ipAddress, cmd, null, 1200)
              .then((res) => {
                if (res && res.ok) executedCount++;
              })
              .catch(() => {})
          );
          await Promise.allSettled(promises);
        } else if (action.deviceId && devicesObj[action.deviceId]) {
          try {
            await tasmotaHttp.sendCommand(devicesObj[action.deviceId].ipAddress, cmd);
            executedCount++;
          } catch {}
        } else if (action.ipAddress) {
          try {
            await tasmotaHttp.sendCommand(action.ipAddress, cmd);
            executedCount++;
          } catch {}
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, sceneId, executedCount }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: err.message }));
    }
  }

  if (req.method === 'DELETE' && sceneDetailMatch) {
    const sceneId = sceneDetailMatch[1];
    try {
      const scenes = loadJson(SCENES_FILE, DEFAULT_SCENES);
      const filtered = scenes.filter((s) => s.id !== sceneId);
      saveJsonAtomic(SCENES_FILE, filtered);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, deletedId: sceneId }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: err.message }));
    }
  }

  // 7. Status API
  if (req.method === 'GET' && url.pathname === '/api/status') {
    const forceSync = url.searchParams.get('sync') === '1';
    try {
      if (forceSync) {
        await deviceStore.syncDevice();
      }
      const st = deviceStore.getDeviceState();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        state: st.power.POWER1 ? 'ON' : 'OFF',
        power: st.power,
        host: CONFIG.RELAY_HOST,
        protocol: st.protocol,
        latency: st.latency,
        lastSync: st.lastSeen,
        wifi: st.wifi,
        uptime: st.uptime,
        loadAvg: st.loadAvg
      }));
    } catch (err) {
      const st = deviceStore.getDeviceState();
      res.writeHead(502, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: err.message, state: st.power.POWER1 ? 'ON' : 'OFF' }));
    }
  }

  // 8. Toggle Relay (Power 1)
  if (req.method === 'POST' && url.pathname === '/api/toggle') {
    try {
      const st = await deviceStore.togglePower('default', 1);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        state: st.power.POWER1 ? 'ON' : 'OFF',
        power: st.power,
        latency: st.latency,
        protocol: st.protocol,
        wifi: st.wifi,
        success: true
      }));
    } catch (err) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: err.message, success: false }));
    }
  }

  // 9. Chime Trigger (Power 2)
  if (req.method === 'POST' && url.pathname === '/api/chime') {
    try {
      const st = await deviceStore.triggerChime('default');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        state: st.power.POWER1 ? 'ON' : 'OFF',
        latency: st.latency,
        protocol: st.protocol,
        wifi: st.wifi,
        success: true
      }));
    } catch (err) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: err.message, success: false }));
    }
  }

  // 10. Direct Tasmota Command API (ASTRA Core endpoint)
  if (req.method === 'POST' && url.pathname === '/api/tasmota/cm') {
    const { command } = await readBodyJSON(req);
    if (!command) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Command missing' }));
    }
    try {
      const dev = deviceStore.getDevice();
      const result = await tasmotaHttp.sendCommand(dev.ipAddress, command);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(result));
    } catch (err) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: err.message }));
    }
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

export {
  base32Decode,
  base32Encode,
  generateTOTP,
  verifyTOTP,
  loadOrGenTotpSecret,
  revokeTotpSecret,
  createSessionToken,
  verifySessionToken,
  CONFIG,
  server,
  tasmotaHttp,
  deviceStore
};

export const SESSION_TTL_MS = CONFIG.SESSION_TTL_MS;
export const SESSION_MAX_AGE_SEC = CONFIG.SESSION_MAX_AGE_SEC;
export const TOTP_SECRET = getTotpSecret();

const isMain = process.argv[1] && (
  process.argv[1] === new URL(import.meta.url).pathname ||
  import.meta.url.endsWith(process.argv[1])
);

if (isMain) {
  server.listen(CONFIG.PORT, '0.0.0.0', () => {
    console.log(`[ASTRA] Smart Home server running at http://0.0.0.0:${CONFIG.PORT}`);
    console.log(`[ASTRA] Relay Target: http://${CONFIG.RELAY_HOST}:${CONFIG.RELAY_PORT}/`);
    console.log(`[2FA] Secret Key: ${getTotpSecret()}`);
    console.log(`[2FA] OTPAuth: ${getOtpAuthUrl(getTotpSecret())}`);
  });
}

import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

// Run directly with Node; deliberately never imports the root test.js or server.
const root = fileURLToPath(new URL('../../../../../', import.meta.url));
const server = await createServer({
  root, configFile: false,
  resolve: { alias: { '@': `${root}src` } },
  server: { middlewareMode: true, watch: null, ws: false },
  appType: 'custom',
});

try {
  const { DeviceInfoWidget } = await server.ssrLoadModule('/src/features/widgets/built-in/device-info/DeviceInfoWidget.tsx');
  const device = {
    id: 'check-device', friendlyName: 'Relay Kitchen', ipAddress: '192.0.2.42',
    hardware: 'Reported chip', module: 'Reported module', firmwareVersion: 'Reported firmware',
    macAddress: '02:00:00:00:00:42', mqttTopic: 'kitchen', addedAt: 0, addedVia: 'manual',
  };
  const state = {
    online: true, lastSeen: 123456789, power: {}, sensors: {}, uptime: '1T02:03:04', latency: 12,
    wifi: { ssid: 'Kitchen WLAN', signal: 75, rssi: -52, channel: 6 },
    gpioConfig: [{ gpioPin: 0, gpioCode: 32, gpioName: 'Button1', entityKey: 'BUTTON1', entityType: 'button' }],
  };
  const render = (colSpan = 3, rowSpan = 3, nextState = state, nextDevice = device) => renderToStaticMarkup(createElement(DeviceInfoWidget, {
    instanceId: 'check', config: { widgetType: 'device-info', deviceIds: [], settings: {} },
    devices: nextDevice ? [nextDevice] : [], deviceStates: nextState ? { [device.id]: nextState } : {},
    onCommand: async () => {}, colSpan, rowSpan,
  }));
  const visibleText = (html) => html.replace(/<[^>]*>/g, ' ');
  const forbidden = /ESP8266EX|14\.x|60:01:94:0F:16:4B|80\/160|MHz|REST API|Backlog|Tối ưu|LAN Wi-Fi|Telemetry Strip|Tải CPU|NaN|Infinity/;

  for (const col of [1, 2, 3]) for (const row of [1, 2, 3]) {
    const html = render(col, row);
    assert.ok(html.includes(`data-layout="${col}x${row}"`));
    assert.ok(html.includes(`data-rows="${row}"`));
    assert.ok(html.includes('Online') || html.includes('Trực tuyến'), `${col}x${row}: Online or Trực tuyến`);
    for (const value of ['75%', '-52 dBm', '12 ms', '1d 2h 3m', 'Reported chip', 'Reported module', 'Reported firmware', 'Button1']) assert.ok(html.includes(value), `${col}x${row}: ${value}`);
    assert.doesNotMatch(visibleText(html), /192\.0\.2\.42|\bIP\b|123456789/);
    assert.doesNotMatch(html, forbidden);
    assert.match(html, /href="http:\/\/192\.0\.2\.42\/" target="_blank" rel="noopener noreferrer"/);
    assert.match(html, /aria-label="Mở Web UI thiết bị \(tab mới\)"/);
    const zero = render(col, row, { ...state, latency: 0, uptime: 0, wifi: { signal: 0, rssi: 0, channel: 0 } });
    assert.match(zero, />0%</); assert.match(zero, />0 ms</); assert.match(zero, />0m 0s</);
    for (const value of [undefined, null, NaN, Infinity]) {
      const missing = render(col, row, { ...state, latency: value, uptime: value, wifi: { signal: value, rssi: value, channel: value }, gpioConfig: undefined }, { ...device, hardware: value, module: value, firmwareVersion: value, macAddress: value });
      assert.match(missing, /class="di-signal">—</);
      assert.match(missing, /Loại thiết bị<\/dt><dd>—</);
      assert.match(missing, /class="di-latency"><dt>Độ trễ<\/dt><dd>—</);
      assert.doesNotMatch(missing, forbidden);
      assert.doesNotMatch(missing, />0%<|>0 ms</);
    }
    assert.match(render(col, row, { ...state, online: false }), /Offline · Dữ liệu cũ|Ngoại tuyến · Dữ liệu cũ/);
    assert.doesNotMatch(render(col, row, { ...state, online: false }), /Lần cuối|lastSeen|123456789/);
    assert.match(render(col, row, null), /Đang chờ dữ liệu/);
    assert.doesNotMatch(render(col, row, null), /Offline|Ngoại tuyến/);
    assert.match(render(col, row, { ...state, online: false, lastSeen: 0 }), /Đang chờ dữ liệu/);
    assert.match(render(col, row, null, null), /Chưa gán thiết bị/);
  }
  for (const signal of [-1, 101]) assert.match(render(3, 3, { ...state, wifi: { signal } }), /class="di-signal">—</);
  for (const address of ['', 'javascript:alert(1)', 'host/path', 'user@host', 'host?query', 'host#hash', 'host\\path', 'host\n']) assert.doesNotMatch(render(3, 3, state, { ...device, ipAddress: address }), /href=/);
  const long = 'VeryLongReportedValue'.repeat(80);
  assert.ok(render(3, 3, { ...state, wifi: { ...state.wifi, ssid: long } }, { ...device, friendlyName: long, firmwareVersion: long }).includes(long));
  assert.match(render(3, 3, { ...state, gpioConfig: [] }), /Không có chân GPIO được báo cáo/);
  const css = await readFile(new URL('./DeviceInfoWidget.css', import.meta.url), 'utf8');
  assert.match(css, /container: hardware \/ inline-size/);
  assert.equal((css.match(/@container hardware/g) || []).length, 2);
  assert.match(css, /min-width: 44px;\s+min-height: 44px;/);
  assert.match(css, /:focus-visible/); assert.match(css, /prefers-reduced-motion/);
  console.log('PASS: nine variants; actual/missing/zero/offline/waiting/no-device data; safe links; GPIO; no invented values or IP text. CSS geometry requires browser validation.');
} finally {
  await server.close();
}

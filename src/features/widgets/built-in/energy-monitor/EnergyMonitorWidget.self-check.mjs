import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../../../../../', import.meta.url));
const server = await createServer({
  root,
  configFile: false,
  resolve: { alias: { '@': `${root}src` } },
  server: { middlewareMode: true, watch: null, ws: false },
  appType: 'custom',
});

try {
  const { EnergyMonitorWidget } = await server.ssrLoadModule(
    '/src/features/widgets/built-in/energy-monitor/EnergyMonitorWidget.tsx'
  );

  const device = {
    id: 'energy-dev-1',
    friendlyName: 'Máy Lạnh Phòng Khách',
    ipAddress: '192.168.1.150',
    mqttTopic: 'aircon',
    addedAt: 0,
    addedVia: 'manual'
  };

  const stateWithEnergy = {
    online: true,
    lastSeen: Date.now(),
    power: { POWER1: true },
    sensors: {},
    energy: {
      power: 850,
      voltage: 220,
      current: 3.86,
      apparentPower: 860,
      reactivePower: 130,
      factor: 0.98,
      today: 4.5,
      yesterday: 6.2,
      total: 320.5
    }
  };

  const render = (colSpan = 2, rowSpan = 1, nextState = stateWithEnergy, nextDevice = device) =>
    renderToStaticMarkup(
      createElement(EnergyMonitorWidget, {
        instanceId: 'check-em',
        config: { widgetType: 'energy-monitor', deviceIds: [], settings: {} },
        devices: nextDevice ? [nextDevice] : [],
        deviceStates: nextState && nextDevice ? { [nextDevice.id]: nextState } : {},
        onCommand: async () => {},
        colSpan,
        rowSpan
      })
    );

  // 1. Check all 9 layout combinations
  for (const col of [1, 2, 3]) {
    for (const row of [1, 2, 3]) {
      const html = render(col, row);
      assert.ok(html.includes(`data-layout="${col}x${row}"`), `Layout ${col}x${row} data-layout missing`);
      assert.ok(html.includes(`data-rows="${row}"`), `Layout ${col}x${row} data-rows missing`);
      assert.ok(html.includes('850 W'), `Layout ${col}x${row} power missing`);
      assert.ok(html.includes('220 V'), `Layout ${col}x${row} voltage missing`);
      assert.ok(html.includes('3.86 A'), `Layout ${col}x${row} current missing`);
      assert.ok(html.includes('Online'), `Layout ${col}x${row} online status missing`);
    }
  }

  // 2. Data honesty: True Zero values vs missing
  const stateZero = {
    online: true,
    lastSeen: Date.now(),
    power: { POWER1: false },
    sensors: {},
    energy: {
      power: 0,
      voltage: 0,
      current: 0,
      apparentPower: 0,
      reactivePower: 0,
      factor: 0,
      today: 0,
      yesterday: 0,
      total: 0
    }
  };
  const htmlZero = render(3, 3, stateZero);
  assert.ok(htmlZero.includes('0 W'), 'True 0 W not displayed correctly');
  assert.ok(htmlZero.includes('0 V'), 'True 0 V not displayed correctly');
  assert.ok(htmlZero.includes('0 A'), 'True 0 A not displayed correctly');
  assert.ok(htmlZero.includes('0 kWh'), 'True 0 kWh not displayed correctly');

  // 3. Missing/undefined energy fields render em-dash '—'
  const stateMissingMetrics = {
    online: true,
    lastSeen: Date.now(),
    power: {},
    sensors: {},
    energy: {
      power: undefined,
      voltage: null,
      current: NaN,
      apparentPower: undefined,
      reactivePower: undefined,
      factor: undefined,
      today: undefined,
      yesterday: undefined,
      total: undefined
    }
  };
  const htmlMissing = render(3, 3, stateMissingMetrics);
  assert.ok(htmlMissing.includes('—'), 'Missing data does not render em-dash');
  assert.ok(!htmlMissing.includes('NaN'), 'NaN leaked into render');
  assert.ok(!htmlMissing.includes('undefined'), 'undefined leaked into render');

  // 4. Device without energy sensor
  const stateNoSensor = {
    online: true,
    lastSeen: Date.now(),
    power: { POWER1: true },
    sensors: {}
  };
  const htmlNoSensor = render(2, 1, stateNoSensor);
  assert.ok(
    htmlNoSensor.includes('Thiết bị không có cảm biến đo năng lượng'),
    'Missing message when device has no energy sensor'
  );

  // 5. Offline state with stale data
  const stateOffline = {
    ...stateWithEnergy,
    online: false,
    lastSeen: Date.now() - 60000
  };
  const htmlOffline = render(2, 1, stateOffline);
  assert.ok(htmlOffline.includes('Offline · Dữ liệu cũ'), 'Offline message missing');

  // 6. Waiting state
  const stateWaiting = {
    online: false,
    lastSeen: 0,
    power: {},
    sensors: {}
  };
  const htmlWaiting = render(2, 1, stateWaiting);
  assert.ok(htmlWaiting.includes('Đang chờ dữ liệu'), 'Waiting message missing');

  // 7. No device assigned
  const htmlNoDevice = render(2, 1, null, null);
  assert.ok(htmlNoDevice.includes('Chưa gán thiết bị'), 'No device assigned message missing');

  // 8. Verify CSS container queries
  const css = await readFile(new URL('./EnergyMonitorWidget.css', import.meta.url), 'utf8');
  assert.match(css, /container:\s*energy\s*\/\s*inline-size/);
  assert.ok((css.match(/@container energy/g) || []).length >= 1, 'Missing @container energy in CSS');

  console.log('PASS: EnergyMonitorWidget self-check (all 9 layouts, data honesty, true 0, missing data em-dash, states, CSS container queries)');
} finally {
  await server.close();
}

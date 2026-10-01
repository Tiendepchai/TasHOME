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
  const { RelayToggleWidget } = await server.ssrLoadModule(
    '/src/features/widgets/built-in/relay-toggle/RelayToggleWidget.tsx'
  );

  const singleDevice = {
    id: 'relay-1ch',
    friendlyName: 'Đèn Bàn',
    ipAddress: '192.168.1.101',
    mqttTopic: 'lamp',
    addedAt: 0,
    addedVia: 'manual'
  };

  const multiDevice = {
    id: 'relay-4ch',
    friendlyName: 'Công Tắc 4 Cổng',
    ipAddress: '192.168.1.104',
    mqttTopic: 'switch4ch',
    relayLabels: {
      POWER1: 'Đèn Chùm',
      POWER2: 'Quạt Trần',
      POWER3: 'Đèn Hắt',
      POWER4: 'Ổ Cắm TV'
    },
    addedAt: 0,
    addedVia: 'manual'
  };

  const singleState = {
    online: true,
    lastSeen: Date.now(),
    power: { POWER1: true },
    sensors: {},
    latency: 18
  };

  const multiState = {
    online: true,
    lastSeen: Date.now(),
    power: {
      POWER1: true,
      POWER2: false,
      POWER3: true,
      POWER4: false
    },
    sensors: {},
    latency: 25
  };

  const render = ({ colSpan = 1, rowSpan = 1, dev = singleDevice, st = singleState } = {}) =>
    renderToStaticMarkup(
      createElement(RelayToggleWidget, {
        instanceId: 'check-relay',
        config: { widgetType: 'relay-toggle', deviceIds: [], settings: {} },
        devices: dev ? [dev] : [],
        deviceStates: dev && st ? { [dev.id]: st } : {},
        onCommand: async () => {},
        colSpan,
        rowSpan
      })
    );

  // 1. Single channel 1x1 hero
  const html1x1 = render({ colSpan: 1, rowSpan: 1, dev: singleDevice, st: singleState });
  assert.ok(html1x1.includes('data-layout="1x1"'));
  assert.ok(html1x1.includes('data-channels="1"'));
  assert.ok(html1x1.includes('rw-hero-toggle'));
  assert.ok(html1x1.includes('BẬT'));

  // 2. Multi-channel 4CH in 2x2 layout
  const htmlMulti = render({ colSpan: 2, rowSpan: 2, dev: multiDevice, st: multiState });
  assert.ok(htmlMulti.includes('data-layout="2x2"'));
  assert.ok(htmlMulti.includes('data-channels="4"'));
  assert.ok(htmlMulti.includes('Đèn Chùm'));
  assert.ok(htmlMulti.includes('Quạt Trần'));
  assert.ok(htmlMulti.includes('Đèn Hắt'));
  assert.ok(htmlMulti.includes('Ổ Cắm TV'));

  // 3. PulseTime timer controls presence
  assert.ok(htmlMulti.includes('Tự tắt sau:'));
  assert.ok(htmlMulti.includes('1p'));
  assert.ok(htmlMulti.includes('5p'));
  assert.ok(htmlMulti.includes('15p'));
  assert.ok(htmlMulti.includes('30p'));
  assert.ok(htmlMulti.includes('Tắt hẹn giờ'));

  // 4. CSS container query
  const css = await readFile(new URL('./RelayToggleWidget.css', import.meta.url), 'utf8');
  assert.match(css, /container:\s*relay\s*\/\s*inline-size/);
  assert.ok((css.match(/@container relay/g) || []).length >= 1, 'Missing @container relay in CSS');

  // 5. No device handling
  const htmlNoDev = render({ dev: null, st: null });
  assert.ok(htmlNoDev.includes('Chưa gán thiết bị'));

  console.log('PASS: RelayToggleWidget self-check (single & multi-relay, PulseTime controls, CSS container queries, responsive attributes)');
} finally {
  await server.close();
}

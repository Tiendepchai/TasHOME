import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { sessionFetch, advanceSession, getSessionEpoch, SESSION_EXPIRED_EVENT } from '../http/session-fetch.js';
import { TasmotaHttpClient } from '../http/tasmota-http-client.js';

// No backend imports, credentials, filesystem state or external requests.
const root = fileURLToPath(new URL('../../../', import.meta.url));
const originalFetch = globalThis.fetch;
const browser = new EventTarget();
browser.location = { href: 'http://fixture.test/', origin: 'http://fixture.test' };
globalThis.window = browser;
let notices = 0;
browser.addEventListener(SESSION_EXPIRED_EVENT, () => notices++);
const denied = () => new Response('{"error":"Unauthorized"}', { status: 401, headers: { 'X-TasHOME-Auth': 'required' } });
try {
  advanceSession(false);
  globalThis.fetch = async () => denied();
  await sessionFetch('/api/auth/session');
  assert.equal(notices, 0, 'Initial login must not report session expiry');
  advanceSession(true);
  await sessionFetch('/api/settings');
  await sessionFetch('/api/devices');
  assert.equal(notices, 1, 'Only one expiry notification per session');
  advanceSession(true);
  globalThis.fetch = async () => new Response('{}', { status: 401 });
  await sessionFetch('/api/auth/login');
  await assert.rejects(new TasmotaHttpClient().getFullStatus('127.0.0.1'), error => error.type === 'auth');
  assert.equal(notices, 1, 'Invalid OTP/device password must not expire session');
  globalThis.fetch = async () => denied();
  await assert.rejects(new TasmotaHttpClient().getFullStatus('127.0.0.1'), error => error.type === 'session');
  assert.equal(notices, 2);
  advanceSession(true);
  await sessionFetch('https://external.fixture/api/devices');
  assert.equal(notices, 2, 'External response must not expire session');
  let complete;
  globalThis.fetch = () => new Promise(resolve => { complete = resolve; });
  const stale = sessionFetch('/api/devices');
  advanceSession(true);
  complete(denied());
  await assert.rejects(stale, error => error.type === 'session');
  assert.equal(notices, 2, 'Old response must not expire new session');
  assert.ok(getSessionEpoch() > 0);
} finally {
  globalThis.fetch = originalFetch;
  delete globalThis.window;
  advanceSession(false);
}

const server = await createServer({
  root, configFile: false,
  resolve: { alias: { '@': `${root}src` } },
  server: { middlewareMode: true, watch: null, ws: false }, appType: 'custom'
});
try {
  const { PinLockScreen } = await server.ssrLoadModule('/src/core/auth/PinLockScreen.tsx');
  const { useLanguageStore } = await server.ssrLoadModule('/src/core/i18n/language-store.ts');
  for (const language of ['vi', 'en', 'de']) {
    useLanguageStore.setState({ language });
    const html = renderToStaticMarkup(createElement(PinLockScreen, { onSuccess() {}, sessionExpired: true }));
    assert.equal((html.match(/<input\b/g) || []).length, 1);
    assert.match(html, /<form\b/);
    assert.match(html, /inputMode="numeric"/);
    assert.match(html, /autoComplete="one-time-code"/);
    assert.match(html, /type="submit"/);
    assert.match(html, /<label\b/);
    assert.match(html, /<details\b/);
    assert.match(html, /aria-live=/);
    assert.doesNotMatch(html, /grid-cols-3|authSessionExpired/);
  }
  const { pollScheduler } = await server.ssrLoadModule('/src/core/http/poll-scheduler.ts');
  const { tasmotaHttp } = await server.ssrLoadModule('/src/core/http/tasmota-http-client.js');
  const { useDeviceStore } = await server.ssrLoadModule('/src/features/devices/store/device-store.ts');
  const device = { id: 'fixture', ipAddress: '127.0.0.1', friendlyName: 'Fixture' };
  const snapshot = { online: true, lastSeen: 42, power: { POWER1: true }, sensors: {} };
  useDeviceStore.setState({ devices: { fixture: device }, deviceStates: { fixture: snapshot } });
  const getFullStatus = tasmotaHttp.getFullStatus;
  try {
    let complete;
    tasmotaHttp.getFullStatus = () => new Promise(resolve => { complete = resolve; });
    pollScheduler.start();
    pollScheduler.stop();
    complete({ ok: false });
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(useDeviceStore.getState().deviceStates.fixture, snapshot, 'Stopped poll completion changed device state');
    tasmotaHttp.getFullStatus = async () => { throw { type: 'session' }; };
    pollScheduler.start();
    await new Promise(resolve => setImmediate(resolve));
    pollScheduler.stop();
    assert.deepEqual(useDeviceStore.getState().deviceStates.fixture, snapshot, 'Session error marked device offline');
  } finally {
    pollScheduler.stop();
    tasmotaHttp.getFullStatus = getFullStatus;
  }
  const session = await server.ssrLoadModule('/src/core/http/session-fetch.js');
  const { useDashboardStore } = await server.ssrLoadModule('/src/features/dashboard/store/dashboard-store.ts');
  globalThis.window = browser;
  try {
    for (const [store, load, field, data] of [
      [useDeviceStore, 'fetchDevices', 'devices', { stale: { id: 'stale' } }],
      [useDashboardStore, 'fetchDashboards', 'dashboards', [{ id: 'stale', widgets: [] }]],
      [useLanguageStore, 'fetchSettings', 'language', { language: 'vi' }]
    ]) {
      session.advanceSession(true);
      const before = store.getState()[field];
      let completeBody;
      let bodyStarted;
      const started = new Promise(resolve => { bodyStarted = resolve; });
      globalThis.fetch = async () => ({ ok: true, status: 200, json: () => {
        bodyStarted();
        return new Promise(resolve => { completeBody = resolve; });
      } });
      const pending = store.getState()[load]();
      await started;
      session.advanceSession(false);
      session.advanceSession(true);
      completeBody(data);
      await pending;
      assert.deepEqual(store.getState()[field], before, `${load} applied an old session body`);
    }
    let saves = 0;
    globalThis.fetch = async () => { saves++; return new Response('{}'); };
    session.advanceSession(true);
    useDashboardStore.getState().resetDefaultLayout();
    session.advanceSession(false);
    session.advanceSession(true);
    await new Promise(resolve => setTimeout(resolve, 300));
    assert.equal(saves, 0, 'Old dashboard debounce persisted into a new session');
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.window;
    session.advanceSession(false);
  }
  console.log('PASS: OTP form vi/en/de; session/device 401; initial/duplicate/stale expiry; stopped polls; stale store bodies/debounce. Interactive states require browser fixture.');
} finally {
  await server.close();
}

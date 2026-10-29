import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as wait } from 'node:timers/promises';

const root = fileURLToPath(new URL('../', import.meta.url));
const executable = process.argv[2] ? path.resolve(process.argv[2]) : process.execPath;
const args = process.argv[2] ? [] : [path.join(root, 'server.js')];
const expectedVersion = process.argv[3] || (process.argv[2] ? JSON.parse(await readFile(path.join(path.dirname(executable), 'manifest.json'), 'utf8')).version : 'development');
const temp = await mkdtemp(path.join(os.tmpdir(), 'tashome-binary-check-'));
const cwd = path.join(temp, 'run');
const stateDir = path.join(temp, 'state');
const secret = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
const session = crypto.randomBytes(32).toString('hex');
await mkdir(cwd);
await mkdir(path.join(stateDir, 'data'), { recursive: true });
await writeFile(path.join(stateDir, '.totp_secret'), secret, { mode: 0o600 });
await writeFile(path.join(stateDir, 'data/settings.json'), '{"language":"vi","fixture":true}');
await writeFile(path.join(cwd, '.env'), 'DO_NOT_SERVE_OR_EMBED_THIS_FIXTURE=1\n');
if (!process.argv[2]) await symlink(path.join(root, 'dist'), path.join(cwd, 'dist'));
const listener = http.createServer();
await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
const port = listener.address().port;
await new Promise(resolve => listener.close(resolve));
const base = `http://127.0.0.1:${port}`;
const expiry = Date.now() + 60000;
const token = `${expiry}.${crypto.createHmac('sha256', session).update(String(expiry)).digest('hex')}`;
const headers = { Cookie: `smarthome_session=${token}` };
const env = { PATH: process.env.PATH, NODE_ENV: 'production', SESSION_SECRET: session, TASHOME_STATE_DIR: stateDir, PORT: String(port), RELAY_HOST: '127.0.0.1', RELAY_PORT: '1' };
const request = (requestPath = '', options = {}) => fetch(`${base}${requestPath}`, { ...options, signal: AbortSignal.timeout(2000) });
const login = body => request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const totp = (timeMs = Date.now()) => {
  const bits = [...secret].map(char => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(char).toString(2).padStart(5, '0')).join('');
  const key = Buffer.from(bits.match(/.{8}/g).map(byte => parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(timeMs / 30000)));
  const digest = crypto.createHmac('sha1', key).update(counter).digest();
  return String((digest.readUInt32BE(digest.at(-1) & 15) & 0x7fffffff) % 1000000).padStart(6, '0');
};
const upstream = http.createServer((req, res) => {
  res.writeHead(401, { 'Content-Type': 'application/json', 'X-TasHOME-Auth': 'required' });
  res.end('{"error":"Device authentication failed"}');
});
let child;
let logs = '';
const start = () => {
  child = spawn(executable, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', data => { logs = (logs + data).slice(-65536); });
  child.stderr.on('data', data => { logs = (logs + data).slice(-65536); });
};
const ready = async () => {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    assert.equal(child.exitCode, null, 'Fixture server exited before becoming healthy');
    try {
      const res = await request('/healthz');
      if (res.ok) { assert.deepEqual(await res.json(), { status: 'ok', version: expectedVersion }); return; }
    } catch (err) { if (err instanceof assert.AssertionError) throw err; }
    await wait(50);
  }
  throw new Error('Fixture server did not become healthy');
};
const stop = async () => {
  if (!child || child.exitCode !== null) return;
  const exited = once(child, 'exit');
  child.kill('SIGTERM');
  const deadline = setTimeout(() => child.kill('SIGKILL'), 12000);
  const [code] = await exited;
  clearTimeout(deadline);
  assert.equal(code, 0, 'Graceful shutdown failed');
};
const rawRequest = requestPath => new Promise((resolve, reject) => {
  const req = http.get({ host: '127.0.0.1', port, path: requestPath }, res => {
    let body = ''; res.on('data', data => { body += data; });
    res.on('end', () => resolve({ status: res.statusCode, body }));
  });
  req.setTimeout(2000, () => req.destroy(new Error('Fixture request timed out')));
  req.on('error', reject);
});
try {
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  start(); await ready();
  const index = await request();
  assert.equal(index.status, 200);
  const html = await index.text();
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g)].map(match => match[1]);
  assert.ok(assets.length >= 2, 'Built SPA is missing embedded JS/CSS');
  for (const asset of assets) assert.equal((await request(asset)).status, 200, asset);
  assert.equal((await request('/healthz', { method: 'HEAD' })).status, 200);
  for (const requestPath of ['/api/devices', '/api/auth/session', '/device-proxy/127.0.0.1:1/cm']) {
    for (const Cookie of ['', 'smarthome_session=invalid', `smarthome_session=0.${crypto.createHmac('sha256', session).update('0').digest('hex')}`]) {
      const res = await request(requestPath, { headers: { Cookie } });
      assert.equal(res.status, 401);
      assert.equal(res.headers.get('X-TasHOME-Auth'), 'required');
      assert.deepEqual(await res.json(), { error: 'Unauthorized', code: 'AUTH_REQUIRED' });
    }
  }
  const authorized = await request('/api/auth/session', { headers });
  assert.equal(authorized.status, 200);
  assert.equal(authorized.headers.get('Cache-Control'), 'no-store');
  assert.equal(authorized.headers.get('Set-Cookie'), null);
  assert.ok(JSON.stringify(await authorized.json()) === '{"authenticated":true}', 'Session probe must return only authenticated:true');
  assert.deepEqual(await (await request('/api/settings', { headers })).json(), { language: 'vi', fixture: true });
  const deviceUnauthorized = await request(`/device-proxy/127.0.0.1:${upstream.address().port}/cm`, { headers });
  assert.equal(deviceUnauthorized.status, 401);
  assert.equal(deviceUnauthorized.headers.get('X-TasHOME-Auth'), null, 'Upstream must not impersonate the session guard');
  assert.deepEqual(await deviceUnauthorized.json(), { error: 'Device authentication failed' });
  const offline = await request('/device-proxy/127.0.0.1:1/cm?cmnd=STATUS%200', { headers });
  assert.equal(offline.status, 502, 'Unreachable device must never return simulated success');
  for (const requestPath of ['/%2e%2e%2f.env', '/%2e%2e%2fstate%2f.totp_secret', '/%00']) {
    const res = await rawRequest(requestPath);
    assert.equal(res.status, 400, requestPath);
    assert.ok(!res.body.includes(secret));
  }
  const validCode = totp();
  for (const pin of [Number(validCode), [validCode], ` ${validCode} `, '１２３４５６']) {
    const res = await login({ pin });
    assert.equal(res.status, 401);
    assert.equal(res.headers.get('X-TasHOME-Auth'), null);
    assert.deepEqual(await res.json(), { success: false, error: 'Mã 2FA không đúng', code: 'INVALID_TOTP', retryAfter: 0 });
  }
  assert.equal((await login({ pin: totp() })).status, 200, 'Valid TOTP must reset the failed-attempt counter');
  const acceptedCodes = new Set(Array.from({ length: 9 }, (_, index) => totp(Date.now() + (index - 4) * 30000)));
  const wrongCode = Array.from({ length: 10 }, (_, index) => String(index).padStart(6, '0')).find(code => !acceptedCodes.has(code));
  const invalidBodies = [{ pin: wrongCode }, { pin: 123456 }, { pin: ` ${totp()} ` }, { pin: '１２３４５６' }, null];
  for (const [index, body] of invalidBodies.entries()) {
    const res = await login(body);
    assert.equal(res.status, 401, 'Invalid TOTP must remain a login error');
    assert.equal(res.headers.get('X-TasHOME-Auth'), null, 'Wrong login must not expire the browser session');
    const result = await res.json();
    assert.equal(result.success, false);
    assert.equal(result.error, 'Mã 2FA không đúng');
    assert.equal(result.code, 'INVALID_TOTP');
    if (index < 4) assert.equal(result.retryAfter, 0);
    else assert.ok(Number.isInteger(result.retryAfter) && result.retryAfter > 0 && result.retryAfter <= 30, 'Fifth failure must start the cooldown');
  }
  const locked = await login({ pin: totp() });
  assert.equal(locked.status, 429, 'Even valid TOTP must respect the global cooldown');
  assert.equal(locked.headers.get('X-TasHOME-Auth'), null);
  const limited = await locked.json();
  assert.equal(limited.success, false);
  assert.equal(limited.code, 'RATE_LIMITED');
  assert.match(limited.error, /^Thử sai quá 5 lần\. Vui lòng chờ \d+s$/);
  assert.ok(Number.isInteger(limited.retryAfter) && limited.retryAfter > 0 && limited.retryAfter <= 30);
  assert.equal(locked.headers.get('Retry-After'), String(limited.retryAfter));
  assert.deepEqual(await (await request('/api/auth/session', { headers })).json(), { authenticated: true });
  // Restart clears only the in-memory lockout before testing login and key revocation.
  await stop(); start(); await ready();
  assert.ok(await readFile(path.join(stateDir, '.totp_secret'), 'utf8') === secret, 'Restart changed TOTP');
  const loggedIn = await login({ pin: totp() });
  assert.equal(loggedIn.status, 200);
  assert.deepEqual(await loggedIn.json(), { success: true, method: '2fa' });
  const cookie = loggedIn.headers.get('Set-Cookie');
  assert.ok(cookie && /; HttpOnly; SameSite=Lax; Max-Age=86400; Path=\/$/.test(cookie), 'Login must preserve the 24-hour HttpOnly session');
  const loggedInHeaders = { Cookie: cookie.split(';')[0] };
  assert.deepEqual(await (await request('/api/auth/session', { headers: loggedInHeaders })).json(), { authenticated: true });
  assert.deepEqual(await (await request('/api/settings', { headers })).json(), { language: 'vi', fixture: true });
  const revoked = await request('/api/auth/revoke-key', { method: 'POST', headers });
  assert.equal(revoked.status, 200);
  const changed = JSON.parse(await revoked.text()).secret;
  assert.ok(changed !== secret, 'Key revocation must replace the fixture secret');
  assert.ok((await readFile(path.join(stateDir, '.totp_secret'), 'utf8')).trim() === changed, 'Revoked key must persist');
  await stop(); start(); await ready(); await stop();
  assert.ok(!logs.includes(secret) && !logs.includes(changed) && !logs.includes(session) && !logs.includes('otpauth://'), 'Startup leaked credentials');
  const emptyState = path.join(temp, 'unprovisioned');
  await mkdir(emptyState);
  for (const override of [{ TASHOME_STATE_DIR: emptyState }, { SESSION_SECRET: '' }]) {
    const rejected = spawn(executable, args, { cwd, env: { ...env, ...override }, stdio: 'ignore' });
    const timeout = setTimeout(() => rejected.kill('SIGKILL'), 5000);
    const [code] = await once(rejected, 'exit'); clearTimeout(timeout);
    assert.notEqual(code, 0, 'Production accepted missing credentials');
    assert.notEqual(code, null, `Production hung instead of failing closed (${Object.keys(override).join(',')})`);
  }
  assert.equal(await readFile(path.join(stateDir, 'data/settings.json'), 'utf8'), '{"language":"vi","fixture":true}');
  console.log(`PASS: ${process.argv[2] ? 'standalone' : 'Node'} SPA/assets, health SHA, session probe/guards, login/cooldown, upstream401 isolation, offline502, path containment, persistent state/TOTP, revoke, fail-closed startup, graceful shutdown`);
} finally {
  if (child && child.exitCode === null && child.signalCode === null) {
    const exited = once(child, 'exit');
    child.kill('SIGKILL');
    await exited;
  }
  if (upstream.listening) {
    const closed = new Promise(resolve => upstream.close(resolve));
    upstream.closeAllConnections();
    await closed;
  }
  await rm(temp, { recursive: true, force: true });
}

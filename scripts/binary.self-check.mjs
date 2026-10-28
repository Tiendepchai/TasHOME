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
const env = { ...process.env, NODE_ENV: 'production', SESSION_SECRET: session, TASHOME_STATE_DIR: stateDir, PORT: String(port), RELAY_HOST: '127.0.0.1' };
delete env.TOTP_SECRET;
delete env.BUN_OPTIONS;
let child;
let logs = '';
const start = () => {
  child = spawn(executable, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', data => { logs += data; });
  child.stderr.on('data', data => { logs += data; });
};
const ready = async () => {
  for (let attempt = 0; attempt < 100; attempt++) {
    assert.equal(child.exitCode, null, `Server exited: ${logs}`);
    try {
      const res = await fetch(`${base}/healthz`);
      if (res.ok) { assert.deepEqual(await res.json(), { status: 'ok', version: expectedVersion }); return; }
    } catch (err) { if (err instanceof assert.AssertionError) throw err; }
    await wait(50);
  }
  throw new Error(`Server did not become healthy: ${logs}`);
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
  req.on('error', reject);
});
try {
  start(); await ready();
  const index = await fetch(base);
  assert.equal(index.status, 200);
  const html = await index.text();
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g)].map(match => match[1]);
  assert.ok(assets.length >= 2, 'Built SPA is missing embedded JS/CSS');
  for (const asset of assets) assert.equal((await fetch(`${base}${asset}`)).status, 200, asset);
  assert.equal((await fetch(`${base}/healthz`, { method: 'HEAD' })).status, 200);
  assert.equal((await fetch(`${base}/api/devices`)).status, 401);
  assert.deepEqual(await (await fetch(`${base}/api/settings`, { headers })).json(), { language: 'vi', fixture: true });
  const offline = await fetch(`${base}/device-proxy/127.0.0.1:1/cm?cmnd=STATUS%200`, { headers });
  assert.equal(offline.status, 502, 'Unreachable device must never return simulated success');
  for (const requestPath of ['/%2e%2e%2f.env', '/%2e%2e%2fstate%2f.totp_secret', '/%00']) {
    const res = await rawRequest(requestPath);
    assert.equal(res.status, 400, requestPath);
    assert.ok(!res.body.includes(secret));
  }
  await stop(); start(); await ready();
  assert.equal(await readFile(path.join(stateDir, '.totp_secret'), 'utf8'), secret, 'Restart changed TOTP');
  assert.deepEqual(await (await fetch(`${base}/api/settings`, { headers })).json(), { language: 'vi', fixture: true });
  const revoked = await fetch(`${base}/api/auth/revoke-key`, { method: 'POST', headers });
  assert.equal(revoked.status, 200);
  const changed = JSON.parse(await revoked.text()).secret;
  assert.notEqual(changed, secret);
  assert.equal((await readFile(path.join(stateDir, '.totp_secret'), 'utf8')).trim(), changed);
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
  console.log(`PASS: ${process.argv[2] ? 'standalone' : 'Node'} SPA/assets, health SHA, auth, offline502, path containment, persistent state/TOTP, revoke, fail-closed startup, graceful shutdown`);
} finally {
  if (child && child.exitCode === null) child.kill('SIGKILL');
  await rm(temp, { recursive: true, force: true });
}

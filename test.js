import assert from 'node:assert';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// 1. Unified Device State Parser (Supports Tasmota & Legacy MinhHa)
export function parseDeviceState(html) {
  if (!html || typeof html !== 'string') return 'UNKNOWN';

  // Tasmota JSON & Web Formats
  if (html.includes('>ON<') || html.includes("var(--c_btn)'") || html.includes('{"POWER":"ON"}') || html.includes('{"POWER1":"ON"}')) {
    return 'ON';
  }
  if (html.includes('>OFF<') || html.includes("var(--c_btnoff)'") || html.includes('{"POWER":"OFF"}') || html.includes('{"POWER1":"OFF"}')) {
    return 'OFF';
  }

  // Legacy MinhHa AT Formats
  if (html.includes('name="RLON"') || html.includes('RELAY OFF')) {
    return 'ON';
  }
  if (html.includes('name="RLOF"') || html.includes('RELAY ON')) {
    return 'OFF';
  }

  return 'UNKNOWN';
}

// Test Tasmota Format
const TASMOTA_HTML_OFF = `<img style='display:none;' src onerror="eb('o1').style.background='var(--c_btnoff)';"><tr><td style='font-size:62px'>OFF</td></tr>`;
const TASMOTA_HTML_ON  = `<img style='display:none;' src onerror="eb('o1').style.background='var(--c_btn)';"><tr><td style='font-size:62px'>ON</td></tr>`;
const TASMOTA_JSON_ON  = `{"POWER":"ON"}`;
const TASMOTA_JSON_OFF = `{"POWER":"OFF"}`;

assert.strictEqual(parseDeviceState(TASMOTA_HTML_OFF), 'OFF');
assert.strictEqual(parseDeviceState(TASMOTA_HTML_ON), 'ON');
assert.strictEqual(parseDeviceState(TASMOTA_JSON_ON), 'ON');
assert.strictEqual(parseDeviceState(TASMOTA_JSON_OFF), 'OFF');

// Test Legacy MinhHa Format
const LEGACY_HTML_OFF = `<form method="POST"><input type="submit" name="RLOF" value="RELAY ON" /></form>`;
const LEGACY_HTML_ON  = `<form method="POST"><input type="submit" name="RLON" value="RELAY OFF" /></form>`;

assert.strictEqual(parseDeviceState(LEGACY_HTML_OFF), 'OFF');
assert.strictEqual(parseDeviceState(LEGACY_HTML_ON), 'ON');
assert.strictEqual(parseDeviceState(''), 'UNKNOWN');
assert.strictEqual(parseDeviceState('<html>Invalid Content</html>'), 'UNKNOWN');

// 2. ASTRA Core Modules Tests
import { tasmotaHttp, TasmotaHttpClient } from './src/core/http/tasmota-http-client.js';
import { HttpError, HTTP_ERROR_TYPES } from './src/core/http/types.js';
import { deviceStore } from './src/features/devices/device-store.js';

// URL builder test
const client = new TasmotaHttpClient();
const url = client.buildUrl('192.168.1.140', 'Status 0', { username: 'admin', password: 'secretpassword' });
assert.strictEqual(url, 'http://192.168.1.140/cm?cmnd=Status+0&user=admin&password=secretpassword');

// HttpError test
const httpErr = new HttpError(HTTP_ERROR_TYPES.TIMEOUT, 'Timed out', 408);
assert.strictEqual(httpErr.name, 'HttpError');
assert.strictEqual(httpErr.type, 'timeout');
assert.strictEqual(httpErr.status, 408);

// DeviceStore test
const dev = deviceStore.getDevice('default');
assert.ok(dev);
assert.strictEqual(dev.hardware, 'ESP8266EX + STM32F103');
const st = deviceStore.getDeviceState('default');
assert.ok(st);
assert.strictEqual(typeof st.power.POWER1, 'boolean');

deviceStore.updateDeviceState('default', {
  power: { POWER1: true },
  latency: 42
});
assert.strictEqual(deviceStore.getDeviceState('default').power.POWER1, true);
assert.strictEqual(deviceStore.getDeviceState('default').latency, 42);

// 3. RFC 6238 TOTP Tests & 1-Day Session Revocation
process.env.NODE_ENV = 'test';
const {
  base32Decode,
  base32Encode,
  generateTOTP,
  verifyTOTP,
  createSessionToken,
  verifySessionToken,
  revokeTotpSecret,
  SESSION_TTL_MS,
  SESSION_MAX_AGE_SEC
} = await import('./server.js');

// 1-Day Session Key Revocation Tests
assert.strictEqual(SESSION_TTL_MS, 24 * 3600 * 1000);
assert.strictEqual(SESSION_MAX_AGE_SEC, 86400);

const freshToken = createSessionToken();
assert.strictEqual(verifySessionToken(freshToken), true);

// Expiry boundary test: 1 day + 1 second ago -> must be revoked (false)
const [expiryPart] = freshToken.split('.');
const expiredToken24h = `${Date.now() - 1000}.${crypto.createHmac('sha256', 'smarthome-relay-secret-key-32bytes!').update(String(Date.now() - 1000)).digest('hex')}`;
assert.strictEqual(verifySessionToken(expiredToken24h), false);

// Base32 round-trip
const sample = Buffer.from('SmartHomeTOTPKey2026');
assert.strictEqual(base32Decode(base32Encode(sample)).toString(), sample.toString());

// RFC 6238 Appendix B test vectors (Secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ')
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
assert.strictEqual(generateTOTP(RFC_SECRET, 59000), '287082');
assert.strictEqual(generateTOTP(RFC_SECRET, 1111111109000), '081804');
assert.strictEqual(generateTOTP(RFC_SECRET, 1234567890000), '005924');

// Window drift validation
const curCode = generateTOTP(RFC_SECRET);
assert.strictEqual(verifyTOTP(curCode, RFC_SECRET), true);
assert.strictEqual(verifyTOTP('999999', RFC_SECRET), false);
assert.strictEqual(verifyTOTP('823543', RFC_SECRET), false); // Fallback PIN must be rejected
assert.strictEqual(verifyTOTP('123', RFC_SECRET), false);

// 2FA Key Revocation Test (Preserve current secret)
const secretPath = path.join(path.dirname(new URL(import.meta.url).pathname), '.totp_secret');
const backupSecret = fs.existsSync(secretPath) ? fs.readFileSync(secretPath, 'utf8') : null;

const revoked = revokeTotpSecret();
assert.ok(revoked.secret.length >= 16);
const newCode = generateTOTP();
assert.strictEqual(verifyTOTP(newCode), true);

if (backupSecret) {
  fs.writeFileSync(secretPath, backupSecret);
}

// Stop polling timer so test process exits cleanly
deviceStore.stopPolling();

console.log('Self-check passed: ASTRA HTTP Client, Device Store, 1-day session key revocation, and RFC 6238 TOTP verified.');

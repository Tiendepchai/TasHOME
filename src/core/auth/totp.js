import crypto from 'node:crypto';
import fs from 'node:fs';
import { CONFIG } from '../config/constants.js';

const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Decode(str) {
  const cleaned = String(str || '').toUpperCase().replace(/[\s=]/g, '');
  let bits = 0, value = 0;
  const bytes = [];
  for (let i = 0; i < cleaned.length; i++) {
    const idx = BASE32_CHARS.indexOf(cleaned[i]);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function base32Encode(buf) {
  let bits = 0, value = 0, output = '';
  for (let i = 0; i < buf.length; i++) {
    value = (value << 8) | buf[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_CHARS[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_CHARS[(value << (5 - bits)) & 31];
  return output;
}

export function loadOrGenTotpSecret() {
  if (process.env.TOTP_SECRET) {
    return process.env.TOTP_SECRET.toUpperCase().replace(/[\s=]/g, '');
  }
  try {
    if (fs.existsSync(CONFIG.SECRET_FILE)) {
      const saved = fs.readFileSync(CONFIG.SECRET_FILE, 'utf8').trim();
      if (saved.length >= 16) return saved.toUpperCase().replace(/[\s=]/g, '');
    }
  } catch {}
  const raw = crypto.randomBytes(20);
  const secret = base32Encode(raw);
  try {
    fs.writeFileSync(CONFIG.SECRET_FILE, secret, { mode: 0o600 });
  } catch (e) {
    console.error('Failed to write .totp_secret:', e.message);
  }
  return secret;
}

let activeSecret = loadOrGenTotpSecret();

export function getTotpSecret() {
  return activeSecret;
}

export function getFormattedSecret(secret = activeSecret) {
  return secret.match(/.{1,4}/g)?.join(' ') || secret;
}

export function getOtpAuthUrl(secret = activeSecret) {
  return `otpauth://totp/SmartHome:Relay?secret=${secret}&issuer=SmartHome&period=30&digits=6`;
}

export function revokeTotpSecret() {
  try {
    if (fs.existsSync(CONFIG.SECRET_FILE)) fs.unlinkSync(CONFIG.SECRET_FILE);
  } catch {}
  activeSecret = loadOrGenTotpSecret();
  const formatted = getFormattedSecret(activeSecret);
  const otpauth = getOtpAuthUrl(activeSecret);
  return { secret: activeSecret, formatted, otpauth };
}

export function generateTOTP(secretKey = null, timeMs = Date.now(), timeStep = 30) {
  const activeKey = secretKey || activeSecret;
  const key = typeof activeKey === 'string' ? base32Decode(activeKey) : activeKey;
  const counter = Math.floor(timeMs / 1000 / timeStep);
  const buf = Buffer.alloc(8);
  buf.writeBigInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1000000;
  return code.toString().padStart(6, '0');
}

export function verifyTOTP(token, secretKey = null, window = 1) {
  const activeKey = secretKey || activeSecret;
  if (!token || typeof token !== 'string' || token.length !== 6) return false;
  const now = Date.now();
  for (let w = -window; w <= window; w++) {
    const expected = generateTOTP(activeKey, now + w * 30000);
    try {
      if (crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected))) {
        return true;
      }
    } catch {}
  }
  return false;
}

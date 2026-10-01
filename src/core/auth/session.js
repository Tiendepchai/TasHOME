import crypto from 'node:crypto';
import { CONFIG } from '../config/constants.js';

export function createSessionToken(secret = CONFIG.SESSION_SECRET, ttlMs = CONFIG.SESSION_TTL_MS) {
  const expiry = Date.now() + ttlMs;
  const hmac = crypto.createHmac('sha256', secret).update(String(expiry)).digest('hex');
  return `${expiry}.${hmac}`;
}

export function verifySessionToken(token, secret = CONFIG.SESSION_SECRET) {
  if (!token) return false;
  const [expiryStr, sig] = token.split('.');
  if (!expiryStr || !sig) return false;
  const expiry = Number(expiryStr);
  if (isNaN(expiry) || Date.now() > expiry) return false;
  const expected = crypto.createHmac('sha256', secret).update(expiryStr).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

export function parseSessionCookie(req) {
  const cookieHeader = req.headers?.cookie || '';
  const match = cookieHeader.match(/smarthome_session=([^;]+)/);
  return match ? match[1] : null;
}

export function isAuthenticated(req) {
  const token = parseSessionCookie(req);
  return verifySessionToken(token);
}

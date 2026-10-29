let failedAttempts = 0;
let lockoutUntil = 0;

export function getRetryAfter() {
  return Math.max(0, Math.ceil((lockoutUntil - Date.now()) / 1000));
}

export function checkRateLimit() {
  const remaining = getRetryAfter();
  return remaining > 0 ? `Thử sai quá 5 lần. Vui lòng chờ ${remaining}s` : null;
}

export function recordLoginAttempt(success) {
  if (success) {
    failedAttempts = 0;
    lockoutUntil = 0;
  } else {
    failedAttempts++;
    if (failedAttempts >= 5) {
      lockoutUntil = Date.now() + 30 * 1000;
    }
  }
}

export function resetRateLimit() {
  failedAttempts = 0;
  lockoutUntil = 0;
}

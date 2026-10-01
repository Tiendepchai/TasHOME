let failedAttempts = 0;
let lockoutUntil = 0;

export function checkRateLimit() {
  if (Date.now() < lockoutUntil) {
    const remaining = Math.ceil((lockoutUntil - Date.now()) / 1000);
    return `Thử sai quá 5 lần. Vui lòng chờ ${remaining}s`;
  }
  return null;
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

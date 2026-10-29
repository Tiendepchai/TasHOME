import { HttpError, HTTP_ERROR_TYPES } from './types.js';

export const SESSION_EXPIRED_EVENT = 'tashome:session-expired';
let epoch = 0;
let active = false;
let notifiedEpoch = -1;

export const getSessionEpoch = () => epoch;
export const isSessionActive = () => active;
export function advanceSession(authenticated = false) {
  active = authenticated;
  return ++epoch;
}

export function isSessionRequired(response) {
  return response.status === 401 && response.headers.get('X-TasHOME-Auth') === 'required';
}

export async function sessionFetch(input, init) {
  let protectedRequest = false;
  if (typeof window !== 'undefined') {
    const url = new URL(input instanceof Request ? input.url : input, window.location.href);
    protectedRequest = url.origin === window.location.origin &&
      (url.pathname.startsWith('/api/') || url.pathname.startsWith('/device-proxy/'));
  }
  const requestEpoch = epoch;
  const response = await fetch(input, init);
  if (!protectedRequest) return response;
  if (requestEpoch !== epoch) {
    throw new HttpError(HTTP_ERROR_TYPES.SESSION, 'Session changed', 401);
  }
  if (active && isSessionRequired(response) && notifiedEpoch !== epoch) {
    notifiedEpoch = epoch;
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
  }
  return response;
}

const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;

export const CONFIG = {
  RELAY_HOST: (isNode && process.env?.RELAY_HOST) || '192.168.1.140',
  RELAY_PORT: (isNode && Number(process.env?.RELAY_PORT)) || 80,
  PORT: (isNode && Number(process.env?.PORT)) || 3000,
  SESSION_SECRET: (isNode && process.env?.SESSION_SECRET) || 'smarthome-relay-secret-key-32bytes!',
  SESSION_TTL_MS: 24 * 3600 * 1000,
  SESSION_MAX_AGE_SEC: 86400,
  HTTP_TIMEOUT: 5000,
  POLL_INTERVAL_MS: 3000,
  SECRET_FILE: isNode ? '.totp_secret' : ''
};

export const TASMOTA_DEFAULTS = {
  HTTP_TIMEOUT: 5000,
  POLL_INTERVAL_MS: 3000,
  BG_POLL_INTERVAL_MS: 30000,
  ACTIVE_POLL_INTERVAL_MS: 5000,
  DEFAULT_POWER_DP: 1,
  CHIME_POWER_DP: 2,
  DEFAULT_DEVICE_IP: '192.168.1.140'
};

export const APP_CONFIG = {
  APP_NAME: 'TasHOME - Tasmota Dashboard',
  STORAGE_KEY_DEVICES: 'astra-devices',
  STORAGE_KEY_DASHBOARDS: 'astra-dashboards',
  STORAGE_KEY_SETTINGS: 'astra-settings',
  STORAGE_KEY_AUTH: 'astra-auth'
};

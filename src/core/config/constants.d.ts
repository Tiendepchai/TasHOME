export interface Config {
  RELAY_HOST: string;
  RELAY_PORT: number;
  PORT: number;
  SESSION_SECRET: string;
  SESSION_TTL_MS: number;
  SESSION_MAX_AGE_SEC: number;
  HTTP_TIMEOUT: number;
  POLL_INTERVAL_MS: number;
  SECRET_FILE: string;
}

export interface TasmotaDefaults {
  HTTP_TIMEOUT: number;
  POLL_INTERVAL_MS: number;
  BG_POLL_INTERVAL_MS: number;
  ACTIVE_POLL_INTERVAL_MS: number;
  DEFAULT_POWER_DP: number;
  CHIME_POWER_DP: number;
  DEFAULT_DEVICE_IP: string;
}

export interface AppConfig {
  APP_NAME: string;
  STORAGE_KEY_DEVICES: string;
  STORAGE_KEY_DASHBOARDS: string;
  STORAGE_KEY_SETTINGS: string;
  STORAGE_KEY_AUTH: string;
}

export declare const CONFIG: Config;
export declare const TASMOTA_DEFAULTS: TasmotaDefaults;
export declare const APP_CONFIG: AppConfig;

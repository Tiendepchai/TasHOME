import { HttpError, HTTP_ERROR_TYPES } from './types';

export interface TasmotaCommandResult<T = any> {
  ok: boolean;
  data: T;
  status: number;
  timestamp: number;
  latency?: number;
}

export declare class TasmotaHttpClient {
  defaultTimeout: number;
  constructor(defaultTimeout?: number);
  buildUrl(ip: string, command: string, auth?: { username?: string; password?: string } | null): string;
  sendCommand<T = any>(
    ip: string,
    command: string,
    auth?: { username?: string; password?: string } | null,
    timeout?: number
  ): Promise<TasmotaCommandResult<T>>;
  getFullStatus(ip: string, auth?: { username?: string; password?: string } | null): Promise<TasmotaCommandResult<any>>;
  getStatus(ip: string, type?: number, auth?: { username?: string; password?: string } | null, timeout?: number): Promise<TasmotaCommandResult<any>>;
  getSensorStatus(ip: string, auth?: { username?: string; password?: string } | null): Promise<TasmotaCommandResult<any>>;
  togglePower(ip: string, index?: number, auth?: { username?: string; password?: string } | null): Promise<TasmotaCommandResult<any>>;
  setPower(ip: string, index?: number, on?: boolean, auth?: { username?: string; password?: string } | null): Promise<TasmotaCommandResult<any>>;
  triggerChime(ip: string, auth?: { username?: string; password?: string } | null): Promise<TasmotaCommandResult<any>>;
  pulseRelay(ip: string, index?: number, durationTenths?: number, auth?: { username?: string; password?: string } | null): Promise<TasmotaCommandResult<any>>;
  scanSubnet(
    subnet: string,
    onProgress?: (scanned: number, total: number) => void,
    onFound?: (device: { ip: string; name: string; model: string }) => void
  ): Promise<Array<{ ip: string; name: string; model: string }>>;
}

export declare const tasmotaHttp: TasmotaHttpClient;
export { HttpError, HTTP_ERROR_TYPES };

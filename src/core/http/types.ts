export type HttpErrorType = 'timeout' | 'cors' | 'auth' | 'network' | 'parse' | 'server';

export interface HttpAuth {
  username?: string;
  password?: string;
}

export interface HttpResult {
  ok: boolean;
  data: Record<string, unknown>;
  status: number;
  timestamp: number;
}

export class HttpError extends Error {
  type: HttpErrorType;
  status?: number;

  constructor(type: HttpErrorType, message: string, status?: number) {
    super(message);
    this.name = 'HttpError';
    this.type = type;
    this.status = status;
  }
}

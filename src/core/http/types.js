export const HTTP_ERROR_TYPES = {
  TIMEOUT: 'timeout',
  CORS: 'cors',
  AUTH: 'auth',
  NETWORK: 'network',
  PARSE: 'parse',
  SERVER: 'server',
};

export class HttpError extends Error {
  constructor(type, message, status) {
    super(message);
    this.name = 'HttpError';
    this.type = type;
    this.status = status;
  }
}

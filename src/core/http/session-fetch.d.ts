export declare const SESSION_EXPIRED_EVENT: string;
export declare function getSessionEpoch(): number;
export declare function isSessionActive(): boolean;
export declare function advanceSession(authenticated?: boolean): number;
export declare function isSessionRequired(response: Response): boolean;
export declare function sessionFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;

import type { TasqAwaitingRequestState } from './types.js';
export declare class TasqError extends Error {
}
export declare class TasqRequestError extends TasqError {
    state: TasqAwaitingRequestState;
    constructor(state: TasqAwaitingRequestState);
}
export declare class TasqRequestTimeoutError extends TasqRequestError {
    message: string;
}
export declare class TasqRequestUnknownMethodError extends TasqRequestError {
    message: string;
}
export declare class TasqRequestRejectedError extends TasqRequestError {
    message: string;
    response_status?: number;
    /**
     * @param state -
     * @param [response_status] -
     */
    constructor(state: TasqAwaitingRequestState, response_status?: number);
}

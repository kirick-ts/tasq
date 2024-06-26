/**
 * @typedef {import('./types.js').TasqAwaitingRequestState} TasqAwaitingRequestState
 */
export class TasqError extends Error {
}
export class TasqRequestError extends TasqError {
    /**
     * @param {TasqAwaitingRequestState} state -
     */
    constructor(state: TasqAwaitingRequestState);
    /** @type {TasqAwaitingRequestState} */
    state: TasqAwaitingRequestState;
}
export class TasqRequestTimeoutError extends TasqRequestError {
}
export class TasqRequestUnknownMethodError extends TasqRequestError {
}
export class TasqRequestRejectedError extends TasqRequestError {
    /**
     * @param {TasqAwaitingRequestState} state -
     * @param {number} [response_status] -
     */
    constructor(state: TasqAwaitingRequestState, response_status?: number);
    /** @type {number} */
    response_status: number;
}
export type TasqAwaitingRequestState = import("./types.js").TasqAwaitingRequestState;

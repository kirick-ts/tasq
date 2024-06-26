
/**
 * @typedef {import('./types.js').TasqAwaitingRequestState} TasqAwaitingRequestState
 */

export class TasqError extends Error {}
export class TasqRequestError extends TasqError {
	/** @type {TasqAwaitingRequestState} */
	state;

	/**
	 * @param {TasqAwaitingRequestState} state -
	 */
	constructor(state) {
		super();

		this.state = state;
	}
}
export class TasqRequestTimeoutError extends TasqRequestError {
	message = 'Request timeouted.';
}
export class TasqRequestUnknownMethodError extends TasqRequestError {
	message = 'Unknown method called.';
}
export class TasqRequestRejectedError extends TasqRequestError {
	message = 'Method failed to execute.';

	/** @type {number} */
	response_status;

	/**
	 * @param {TasqAwaitingRequestState} state -
	 * @param {number} [response_status] -
	 */
	constructor(state, response_status) {
		super(state);

		this.response_status = response_status;
	}
}

import type { TasqAwaitingRequestState } from './types.js';

export class TasqError extends Error {}
export class TasqRequestError extends TasqError {
	state: TasqAwaitingRequestState;

	constructor(state: TasqAwaitingRequestState) {
		super();

		this.state = state;
	}
}
export class TasqRequestTimeoutError extends TasqRequestError {
	override message = 'Request timeouted.';
}
export class TasqRequestUnknownMethodError extends TasqRequestError {
	override message = 'Unknown method called.';
}
export class TasqRequestRejectedError extends TasqRequestError {
	override message = 'Method failed to execute.';
	response_status?: number;

	/**
	 * @param state -
	 * @param [response_status] -
	 */
	constructor(
		state: TasqAwaitingRequestState,
		response_status?: number,
	) {
		super(state);
		this.response_status = response_status;
	}
}

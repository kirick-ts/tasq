import type { TasqAwaitingRequestState } from './types.js';

export class TasqError extends Error {}
export class TasqRequestError extends TasqError {
	constructor(public state: TasqAwaitingRequestState) {
		super();
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
}
export class TasqRequestDestroyedError extends TasqRequestError {
	override message = 'Tasq instance was destroyed.';
}

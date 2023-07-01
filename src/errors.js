
export class TasqError extends Error {}
export class TasqRequestError extends TasqError {
	constructor(topic, method, data) {
		super();

		this.request = {
			topic,
			method,
			data,
		};
	}
}
export class TasqRequestTimeoutError extends TasqRequestError {
	message = 'Request timeouted.';
}
export class TasqRequestRejectedError extends TasqRequestError {
	message = 'Method failed to execute.';
}
export class TasqRequestUnknownMethodError extends TasqRequestError {
	message = 'Unknown method called.';
}

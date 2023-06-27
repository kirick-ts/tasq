
export class TasqError extends Error {}
export class TasqRequestError extends TasqError {
	constructor(topic, method, data, message = 'unknown error') {
		super(`Request error: ${message}.`);

		this.request = {
			topic,
			method,
			data,
		};
	}
}
export class TasqRequestTimeoutError extends TasqRequestError {
	constructor(...args) {
		super(
			...args,
			'timeout',
		);
	}
}
export class TasqRequestRejectedError extends TasqRequestError {
	constructor(code, ...args) {
		super(
			...args,
			'rejected',
		);

		this.code = code;
	}
}


/**
 * @typedef {import('./types.js').TasqAwaitingRequestState} TasqAwaitingRequestState
 * @typedef {import('./types.js').TasqRedisRequest} TasqRedisRequest
 * @typedef {import('./types.js').TasqRedisResponse} TasqRedisResponse
 * @typedef {import('./types.js').TasqRequestData} TasqRequestData
 * @typedef {import('./types.js').TasqResponseData} TasqResponseData
 * @typedef {import('./types.js').TasqServerOptions} TasqServerOptions
 */

import {
	encode as cborEncode,
	decode as cborDecode }          from 'cbor-x';
import {
	TasqRequestTimeoutError,
	TasqRequestRejectedError,
	TasqRequestUnknownMethodError } from './errors.js';
import {
	getTime,
	getRedisKey,
	getRedisChannelForRequest,
	getRedisChannelForResponse }    from './fns.js';
import createID                     from './id.js';
import TasqServer                   from './server.js';

export class Tasq {
	#id = createID().toString('base64').replaceAll('=', '');

	/**
	 * @type {import('redis').RedisClientType}
	 */
	#client_pub;
	/**
	 * @type {import('redis').RedisClientType}
	 */
	#client_sub;

	/**
	 * Active requests that are waiting for a response.
	 * @type {Map<string, { state: TasqAwaitingRequestState, resolve: (value: any) => void, reject: (error: Error) => void }>}
	 */
	#requests = new Map();
	#servers = new Set();

	/**
	 * @param {import('redis').RedisClientType} client The Redis client from "redis" package to be used.
	 */
	constructor(client) {
		this.#client_pub = client;
		this.#prepareSubClient().catch((error) => {
			console.error(error);
		});
	}

	/**
	 * Creates a new Redis client for the subscription.
	 * @returns {Promise<void>}
	 */
	async #prepareSubClient() {
		this.#client_sub = this.#client_pub.duplicate();

		this.#client_sub.on(
			'error',
			(error) => {
				console.error(error);
			},
		);

		await this.#client_sub.connect();

		await this.#client_sub.subscribe(
			getRedisChannelForResponse(this.#id),
			(message) => {
				this.#onResponse(message);
			},
			true, // receive buffers
		);
	}

	/**
	 * Schedules a new task.
	 * @param {string} topic The topic of the task.
	 * @param {string} method The method to be called.
	 * @param {TasqRequestData} [data] The data to be passed to the method.
	 * @param {object} [options] The options for the task.
	 * @param {number} [options.timeout] The timeout for the task.
	 * @returns {Promise<TasqResponseData>} The result of the task.
	 */
	async request(
		topic,
		method,
		data,
		{
			timeout = 10_000,
		} = {},
	) {
		const request_id = createID();
		const request_id_string = request_id.toString('hex');

		const redis_key = getRedisKey(topic);

		/** @type {TasqRedisRequest} */
		const request = [
			this.#id,
			request_id,
			getTime() + timeout,
			method,
		];
		if (data) {
			request[4] = data;
		}

		await this.#client_pub.multi()
			.RPUSH(
				redis_key,
				cborEncode(request),
			)
			.PEXPIRE(
				redis_key,
				timeout,
			)
			.PUBLISH(
				getRedisChannelForRequest(topic),
				'',
			)
			.exec();

		return Promise.race([
			new Promise((resolve, reject) => {
				this.#requests.set(
					request_id_string,
					{
						state: [
							topic,
							method,
							data,
						],
						resolve,
						reject,
					},
				);
			}),
			new Promise((_resolve, reject) => {
				setTimeout(
					() => {
						this.#requests.delete(request_id_string);
						reject(
							new TasqRequestTimeoutError([
								topic,
								method,
								data,
							]),
						);
					},
					timeout,
				);
			}),
		]);
	}

	/**
	 * Handles a response to a task.
	 * @param {Buffer} message The message received.
	 */
	#onResponse(message) {
		/** @type {TasqRedisResponse} */
		const [
			request_id,
			status,
			data,
		] = cborDecode(message);

		const request_id_string = request_id.toString('hex');

		if (this.#requests.has(request_id_string)) {
			const {
				state,
				resolve,
				reject,
			} = this.#requests.get(request_id_string);

			this.#requests.delete(request_id_string);

			switch (status) {
				case 0:
					resolve(data);
					break;
				case 1:
					reject(
						new TasqRequestRejectedError(state),
					);
					break;
				case 2:
					reject(
						new TasqRequestUnknownMethodError(state),
					);
					break;
				default:
					reject(
						new Error('Unknown response status.'),
					);
			}

			if (status === 0) {
				resolve(data);
			}
			else {
				reject(
					new TasqRequestRejectedError(
						state,
						status,
					),
				);
			}
		}
	}

	/**
	 * Creates a new Tasq server.
	 * @param {TasqServerOptions} options The options for the server.
	 * @returns {TasqServer} The Tasq server.
	 */
	serve(options) {
		const server = new TasqServer(
			this.#client_pub,
			options,
		);

		this.#servers.add(server);

		return server;
	}

	/**
	 * Destroys the Tasq instance.
	 * @returns {Promise<void>}
	 */
	async destroy() {
		await this.#client_sub.unsubscribe();
		// await this.#client_sub.QUIT(); // Error: Cannot send commands in PubSub mode
		await this.#client_sub.disconnect();

		for (const server of this.#servers) {
			// eslint-disable-next-line no-await-in-loop
			await server.destroy();
		}
	}
}

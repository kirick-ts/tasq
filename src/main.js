
/**
 * @typedef {import('redis').RedisClient} RedisClient
 */

import {
	encode as cborEncode,
	decode as cborDecode } from 'cbor-x';

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

const TIMEOUT = 10_000;

export class Tasq {
	#id = createID().toString('base64').replaceAll('=', '');
	#client_pub;
	#client_sub;
	#requests = new Map();
	#servers = new Set();

	/**
	 * @param {RedisClient} client The Redis client from "redis" package to be used.
	 */
	constructor(client) {
		this.#client_pub = client;
		this.#prepareSubClient().catch((error) => {
			console.error(error);
		});
	}

	/**
	 * Creates a new Redis client for the subscription.
	 * @private
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
	 * @param {{[key: string]: any}} data The data to be passed to the method.
	 * @returns {Promise<{[key: string]: any} | [*]>} The result of the task.
	 */
	async request(topic, method, data) {
		const request_id = createID();
		const request_id_string = request_id.toString('hex');

		const redis_key = getRedisKey(topic);

		const request = [
			this.#id,
			request_id,
			getTime() + TIMEOUT,
			method,
		];
		if (data !== undefined) {
			request.push(data);
		}

		await this.#client_pub.MULTI()
			.RPUSH(
				redis_key,
				cborEncode(request),
			)
			.PEXPIRE(
				redis_key,
				TIMEOUT,
			)
			.PUBLISH(
				getRedisChannelForRequest(topic),
				'',
			)
			.EXEC();

		return Promise.race([
			new Promise((resolve, reject) => {
				this.#requests.set(
					request_id_string,
					{
						request: [
							topic,
							method,
							data,
						],
						resolve,
						reject,
					},
				);
			}),
			new Promise((resolve, reject) => {
				setTimeout(
					() => {
						this.#requests.delete(request_id_string);
						reject(
							new TasqRequestTimeoutError(
								topic,
								method,
								data,
							),
						);
					},
					TIMEOUT,
				);
			}),
		]);
	}

	/**
	 * Handles a response to a task.
	 * @private
	 * @param {Buffer} message The message received.
	 * @returns {void}
	 */
	#onResponse(message) {
		const [
			request_id,
			status,
			data,
		] = cborDecode(message);

		const request_id_string = request_id.toString('hex');

		if (this.#requests.has(request_id_string)) {
			const {
				request,
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
						new TasqRequestRejectedError(...request),
					);
					break;
				case 2:
					reject(
						new TasqRequestUnknownMethodError(...request),
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
						status,
						...request,
					),
				);
			}
		}
	}

	/**
	 * Creates a new Tasq server.
	 * @param {{[key: string]: string}} options The options for the server.
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

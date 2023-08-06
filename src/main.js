
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

export default class Tasq {
	#id = createID();
	#client_pub;
	#client_sub;
	#requests = new Map();
	#servers = new Set();

	constructor(client) {
		this.#client_pub = client;
		this.#prepareSubClient().catch((error) => {
			console.error(error);
		});
	}

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

	async request(target, data) {
		const request_id = createID();
		const request_id_string = request_id.toString('base64');

		const [ topic, method ] = target.split('.', 2);
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

		await this.#client_pub.multi()
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
			.exec();

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

	#onResponse(message) {
		const [
			request_id,
			status,
			data,
		] = cborDecode(message);

		const request_id_string = request_id.toString('base64');

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

	serve(options) {
		const server = new TasqServer(
			this.#client_pub,
			options,
		);

		this.#servers.add(server);

		return server;
	}

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

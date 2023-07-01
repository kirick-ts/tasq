
import RedisClient from '@kirick/redis-client/src/client.js';

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
		if (client instanceof RedisClient !== true) {
			throw new TypeError(
				'Expected client to be an instance of RedisClient.',
			);
		}

		this.#client_pub = client;
		this.#client_sub = client.duplicate();

		this.#client_sub.subscribe(
			getRedisChannelForResponse(this.#id),
			(message) => {
				this.#onResponse(message);
			},
		).catch((error) => {
			console.error(error);
		});
	}

	async request(target, data) {
		const request_id = createID();

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

		await this.#client_pub.MULTI()
			.RPUSH(
				redis_key,
				JSON.stringify(request),
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
					request_id,
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
						this.#requests.delete(request_id);
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
		] = JSON.parse(message);

		if (this.#requests.has(request_id)) {
			const {
				request,
				resolve,
				reject,
			} = this.#requests.get(request_id);

			this.#requests.delete(request_id);

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

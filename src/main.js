
import { createClient }   from '@kirick/redis-client';

import { TasqRequestTimeoutError,
         TasqRequestRejectedError }   from './errors.js';
import { getTime,
         getRedisKey,
         getRedisChannelForRequest,
         getRedisChannelForResponse } from './fns.js';
import createID                       from './id.js';
import TasqServer                     from './server.js';

const TIMEOUT = 10_000;

export default class Tasq {
	#id = createID();
	#client_pub;
	#client_sub;
	#requests = new Map();
	#servers = new Set();

	constructor(client_configuration) {
		this.#client_pub = createClient(client_configuration);
		this.#client_sub = this.#client_pub.duplicate();

		this.#client_sub.subscribe(
			getRedisChannelForResponse(this.#id),
			(message) => {
				this.#onResponse(message);
			},
		);
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

	destroy() {
		this.#client_sub.unsubscribe();
		// TODO: close client connections

		for (const server of this.#servers) {
			server.destroy();
		}
	}
}

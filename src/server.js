
import { commandOptions }  from 'redis';
import {
	encode as cborEncode,
	decode as cborDecode } from 'cbor-x';

import {
	getTime,
	getRedisKey,
	getRedisChannelForRequest,
	getRedisChannelForResponse } from './fns.js';

export default class TasqServer {
	#client_pub;
	#client_sub;
	#handler;
	#handlers;
	#redis_key;
	#redis_channel;
	#processes = 0;
	#processes_max = 1;

	constructor(
		client,
		{
			topic,
			threads = 1,
			handler,
			handlers,
		},
	) {
		this.#client_pub = client;
		this.#prepareSubClient().catch((error) => {
			console.error(error);
		});
		this.#handler = handler;
		this.#handlers = handlers;
		this.#redis_key = getRedisKey(topic);
		this.#redis_channel = getRedisChannelForRequest(topic);
		this.#processes_max = threads;
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
			this.#redis_channel,
			() => {
				// console.log('New task available!\nRunning scheduler...');
				this.#schedule();
			},
		);

		this.#schedule();
	}

	#schedule() {
		this.#execute().catch((error) => {
			console.error(error);
		});
	}

	async #execute() {
		if (this.#processes >= this.#processes_max) {
			// console.log('Maximum number of processes reached.');
			return;
		}

		this.#processes++;

		const task_buffer = await this.#client_pub.LPOP(
			commandOptions({
				returnBuffers: true,
			}),
			this.#redis_key,
		);
		const has_task = Buffer.isBuffer(task_buffer);
		if (has_task) {
			const [
				client_id,
				request_id,
				ts_timeout,
				method,
				method_args = {},
			] = cborDecode(task_buffer);

			if (getTime() < ts_timeout) {
				// console.log(`Running task with method "${method}"...`);

				const response = [
					request_id,
				];

				let handler;
				let handler_args;
				if (typeof this.#handlers?.[method] === 'function') {
					handler = this.#handlers[method];
					handler_args = [ method_args ];
				}
				else if (typeof this.#handler === 'function') {
					handler = this.#handler;
					handler_args = [
						method,
						method_args,
					];
				}

				if (handler) {
					try {
						response.push(
							0,
							await handler(...handler_args),
						);
					}
					catch {
						response.push(1);
					}
				}
				else {
					response.push(2);
				}

				await this.#client_pub.publish(
					getRedisChannelForResponse(client_id),
					cborEncode(response),
				);
			}
			// else {
			// 	console.log('Task expired.');
			// }
		}
		// else {
		// 	console.log('No more tasks to execute.');
		// }

		this.#processes--;

		if (has_task) {
			this.#schedule();
		}
	}

	async destroy() {
		await this.#client_sub.unsubscribe();
		// await this.#client_sub.QUIT(); // Error: Cannot send commands in PubSub mode
		await this.#client_sub.disconnect();
	}
}

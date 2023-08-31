
/**
 * @typedef {import('redis').RedisClient} RedisClient
 */

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

	/**
	 * @param {RedisClient} client The Redis client from "redis" package to be used.
	 * @param {object} options The options for the server.
	 * @param {string} options.topic The topic to be used.
	 * @param {number | undefined} [options.threads] The maximum number of parallel tasks to be executed. Defaults to 1.
	 * @param {Function | undefined} [options.handler] The default handler to be used. If there is no handler for a method in the "handlers" object, this handler will be used.
	 * @param {object | undefined} [options.handlers] The handlers to be used. The keys are the method names and the values are the handlers.
	 */
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
			this.#redis_channel,
			() => {
				// console.log('New task available!\nRunning scheduler...');
				this.#schedule();
			},
		);

		this.#schedule();
	}

	/**
	 * Schedules a new task execute.
	 * @private
	 */
	#schedule() {
		this.#execute().catch((error) => {
			console.error(error);
		});
	}

	/**
	 * Gets a task from the queue and executes it.
	 * @private
	 * @returns {Promise<void>}
	 */
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

	/**
	 * Destroys the server.
	 * @returns {Promise<void>}
	 */
	async destroy() {
		await this.#client_sub.unsubscribe();
		// await this.#client_sub.QUIT(); // Error: Cannot send commands in PubSub mode
		await this.#client_sub.disconnect();
	}
}

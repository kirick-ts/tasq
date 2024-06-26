
/**
 * @typedef {import('./types.js').TasqRequestData} TasqRequestData
 * @typedef {import('./types.js').TasqResponseData} TasqResponseData
 * @typedef {import('./types.js').TasqServerOptions} TasqServerOptions
 * @typedef {import('./types.js').TasqServerHandler} TasqServerHandler
 * @typedef {import('./types.js').TasqServerDefaultHandler} TasqServerDefaultHandler
 */

import { commandOptions }        from 'redis';
import {
	encode as cborEncode,
	decode as cborDecode }       from 'cbor-x';
import {
	getTime,
	getRedisKey,
	getRedisChannelForRequest,
	getRedisChannelForResponse } from './fns.js';

export default class TasqServer {
	/**
	 * Redis client for executing commands.
	 * @type {import('redis').RedisClientType}
	 */
	#client_pub;

	/**
	 * Redis client for subscribing to channels.
	 * @type {import('redis').RedisClientType}
	 */
	#client_sub;

	/**
	 * The default handler for the tasks.
	 * @type {TasqServerDefaultHandler?}
	 */
	#handler;

	/**
	 * The handlers for the tasks.
	 * @type {Record<string, TasqServerHandler>}
	 */
	#handlers = {};

	/**
	 * The Redis key where the tasks are stored.
	 * @type {string}
	 */
	#redis_key;

	/**
	 * The Redis channel where the tasks are published.
	 * @type {string}
	 */
	#redis_channel;

	/**
	 * The number of processes currently running.
	 * @type {number}
	 */
	#processes = 0;

	/**
	 * The maximum number of processes to be run in parallel.
	 * @type {number}
	 */
	#processes_max = 1;

	/**
	 * Indicates if there are unresponded notifications.
	 * @type {boolean}
	 */
	#has_unresponded_notification = false;

	/**
	 * @param {import('redis').RedisClientType} client The Redis client from "redis" package to be used.
	 * @param {TasqServerOptions} options The options for the server.
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
		this.#prepareSubClient()
			.catch((error) => {
				console.error(error);
			});

		if (handler) {
			this.#handler = handler;
		}
		if (handlers) {
			this.#handlers = handlers;
		}

		this.#redis_key = getRedisKey(topic);
		this.#redis_channel = getRedisChannelForRequest(topic);

		this.#processes_max = threads;
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
			this.#redis_channel,
			() => {
				// console.log('New task available! Running scheduler...');
				this.#has_unresponded_notification = true;
				this.#schedule(true);
			},
		);

		this.#schedule();
	}

	/**
	 * Schedules a new task execute.
	 * @param {boolean} [by_notification] - Indicates if the task was scheduled by a Redis message.
	 */
	#schedule(by_notification = false) {
		this.#execute(by_notification)
			.catch((error) => {
				console.error(error);
			});
	}

	/**
	 * Gets a task from the queue and executes it.
	 * @param {boolean} [by_notification] - Indicates if the task was scheduled by a Redis message.
	 * @returns {Promise<void>}
	 */
	async #execute(by_notification = false) {
		// const _run_id = Math.random().toString(36).slice(2, 11);
		// console.log(`[run ${_run_id}] Started`);

		if (this.#processes >= this.#processes_max) {
			// console.log(`[run ${_run_id}] Maximum number of processes reached.`);
			return;
		}

		this.#processes++;
		if (by_notification) {
			this.#has_unresponded_notification = false;
		}

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
				// console.log(`[run ${_run_id}] Running task with method "${method}" and arguments`, method_args);

				const response = [
					request_id,
				];

				const handler = this.#handlers[method];
				if (typeof handler === 'function') {
					try {
						response.push(
							0,
							await handler(method_args),
						);
					}
					catch {
						response.push(1);
					}
				}
				else if (typeof this.#handler === 'function') {
					try {
						response.push(
							0,
							await this.#handler(
								method,
								method_args,
							),
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
			// 	console.log(`[run ${_run_id}] Task expired.`);
			// }
		}
		// else {
		// 	console.log(`[run ${_run_id}] No more tasks to execute.`);
		// }

		this.#processes--;

		if (
			has_task
			|| this.#has_unresponded_notification
		) {
			// console.log(`[run ${_run_id}] Starting another scheduler...`);
			this.#schedule(
				this.#has_unresponded_notification,
			);
		}
		// else {
		// 	console.log(`[run ${_run_id}] Scheduler finished.`);
		// }
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

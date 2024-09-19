import { commandOptions } from 'redis';
import * as CBOR from 'cbor-x';
import {
	getTime,
	getRedisKey,
	getRedisChannelForRequest,
	getRedisChannelForResponse,
} from './fns.js';
import type {
	MaybePromise,
	RedisClient,
	TasqRedisRequest,
	TasqRedisResponse,
	TasqRequestData,
	TasqResponseData,
} from './types.js';

type TasqServerHandler = (args?: TasqRequestData) => MaybePromise<TasqResponseData>;
type TasqServerDefaultHandler = (method: string, args?: TasqRequestData) => MaybePromise<TasqResponseData>;

export interface TasqServerOptions {
	topic: string;
	threads?: number;
	handler?: TasqServerDefaultHandler;
	handlers?: Record<string, TasqServerHandler>;
}

export class TasqServer {
	/** Redis client for executing commands. */
	private client_pub: RedisClient;
	/** Redis client for subscribing to channels. */
	private client_sub: RedisClient;
	/** The default handler for the tasks. */
	private handler?: TasqServerDefaultHandler;
	/** The handlers for the tasks. */
	private handlers: Record<string, TasqServerHandler> = {};
	/** The Redis key where the tasks are stored. */
	private redis_key: string;
	/** The Redis channel where the tasks are published. */
	private redis_channel: string;
	/** The number of processes are currently running. */
	private processes: number = 0;
	/** The maximum number of processes to be run in parallel. */
	private processes_max: number = 1;
	/**  Indicates if there are unresponded notifications. */
	private has_unresponded_notification: boolean = false;

	constructor(
		client: RedisClient,
		{
			topic,
			threads = 1,
			handler,
			handlers,
		}: TasqServerOptions,
	) {
		this.client_pub = client;

		this.client_sub = this.client_pub.duplicate();
		this.client_sub.on(
			'error',
			// eslint-disable-next-line no-console
			console.error,
		);
		this.prepareSubClient()
			// eslint-disable-next-line no-console
			.catch(console.error);

		if (handler) {
			this.handler = handler;
		}

		if (handlers) {
			this.handlers = handlers;
		}

		this.redis_key = getRedisKey(topic);
		this.redis_channel = getRedisChannelForRequest(topic);

		this.processes_max = threads;
	}

	/**
	 * Creates a new Redis client for the subscription.
	 * @returns -
	 */
	private async prepareSubClient() {
		await this.client_sub.connect();
		await this.client_sub.subscribe(
			this.redis_channel,
			() => {
				// console.log('New task available! Running scheduler...');
				this.has_unresponded_notification = true;
				this.schedule(true);
			},
		);

		this.schedule();
	}

	/**
	 * Schedules a new task execute.
	 * @param [by_notification] - Indicates if the task was scheduled by a Redis message.
	 */
	private schedule(by_notification: boolean = false) {
		this.execute(by_notification)
			// eslint-disable-next-line no-console
			.catch(console.error);
	}

	/**
	 * Gets a task from the queue and executes it.
	 * @param [by_notification] - Indicates if the task was scheduled by a Redis message.
	 * @returns -
	 */
	private async execute(by_notification: boolean = false) {
		// const _run_id = Math.random().toString(36).slice(2, 11);
		// console.log(`[run ${_run_id}] Started`);

		if (this.processes >= this.processes_max) {
			// console.log(`[run ${_run_id}] Maximum number of processes reached.`);
			return;
		}

		this.processes++;
		if (by_notification) {
			this.has_unresponded_notification = false;
		}

		const task_buffer = await this.client_pub.LPOP(
			commandOptions({
				returnBuffers: true,
			}),
			this.redis_key,
		);
		const has_task = Buffer.isBuffer(task_buffer);
		if (has_task) {
			const [
				client_id,
				request_id,
				ts_timeout,
				method,
				method_args,
			]: TasqRedisRequest = CBOR.decode(task_buffer);

			if (getTime() < ts_timeout) {
				// console.log(`[run ${_run_id}] Running task with method "${method}" and arguments`, method_args);

				const response: TasqRedisResponse = [
					request_id,
					0,
				];

				const handler = this.handlers[method];
				if (typeof handler === 'function') {
					try {
						response[2] = await handler(method_args);
					}
					catch {
						response[1] = 1;
					}
				}
				else if (typeof this.handler === 'function') {
					try {
						response[2] = await this.handler(
							method,
							method_args,
						);
					}
					catch {
						response[1] = 1;
					}
				}
				else {
					response[1] = 2;
				}

				await this.client_pub.publish(
					getRedisChannelForResponse(client_id),
					CBOR.encode(response),
				);
			}
			// else {
			// 	console.log(`[run ${_run_id}] Task expired.`);
			// }
		}
		// else {
		// 	console.log(`[run ${_run_id}] No more tasks to execute.`);
		// }

		this.processes--;

		if (
			has_task
			|| this.has_unresponded_notification
		) {
			// console.log(`[run ${_run_id}] Starting another scheduler...`);
			this.schedule(
				this.has_unresponded_notification,
			);
		}
		// else {
		// 	console.log(`[run ${_run_id}] Scheduler finished.`);
		// }
	}

	/**
	 * Destroys the server.
	 * @returns -
	 */
	async destroy() {
		await this.client_sub.unsubscribe();
		// await this.#client_sub.QUIT(); // Error: Cannot send commands in PubSub mode
		await this.client_sub.disconnect();
	}
}

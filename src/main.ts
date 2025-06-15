import * as CBOR from 'cbor-x';
import {
	TasqRequestTimeoutError,
	TasqRequestRejectedError,
	TasqRequestUnknownMethodError,
} from './errors.js';
import {
	getTime,
	getRedisKey,
	getRedisChannelForRequest,
	getRedisChannelForResponse,
} from './fns.js';
import {
	createId,
	createIdString,
} from './id.js';
import {
	TasqServer,
	type TasqServerOptions,
} from './server.js';
import type {
	RedisClient,
	TasqAwaitingRequestState,
	TasqRedisRequest,
	TasqRedisResponse,
	TasqRequestData,
	TasqResponseData,
} from './types.js';

interface TasqOptions {
	redisSubClient?: RedisClient;
	namespace?: string;
}

const symbol_no_new: symbol = Symbol('no_new');

export class Tasq {
	private id = createIdString();
	private redisClient: RedisClient;
	private redisSubClient: RedisClient;
	private is_redis_sub_client_internal = false;
	/** Active requests that are waiting for a response. */
	private requests = new Map<
		string,
		{
			state: TasqAwaitingRequestState,
			resolve: (value: TasqResponseData) => void,
			reject: (error: Error) => void,
		}
	>();
	private servers = new Set<TasqServer>();

	/**
	 * @param redisClient The Redis client from "redis" package to be used.
	 * @param options The configuration for the Tasq instance.
	 * @param no_new Symbol to prevent instantiation.
	 */
	constructor(
		redisClient: RedisClient,
		options: TasqOptions,
		no_new: typeof symbol_no_new,
	) {
		if (no_new !== symbol_no_new) {
			throw new Error('Do not use new Tasq(...), use createTasq(...) instead.');
		}

		if (typeof options.namespace === 'string') {
			this.id = `${options.namespace}:${this.id}`;
		}

		this.redisClient = redisClient;

		if (options.redisSubClient) {
			this.redisSubClient = options.redisSubClient;
		}
		else {
			this.redisSubClient = redisClient.duplicate();
			this.is_redis_sub_client_internal = true;
		}
	}

	/**
	 * Creates a new Redis client for the subscriptions.
	 * @returns -
	 */
	private async initSubClient() {
		if (this.is_redis_sub_client_internal) {
			this.redisSubClient.on(
				'error',
				// eslint-disable-next-line no-console
				console.error,
			);

			await this.redisSubClient.connect();
		}

		await this.redisSubClient.subscribe(
			getRedisChannelForResponse(this.id),
			(message) => {
				this.onResponse(message);
			},
			true, // receive buffers
		);
	}

	/**
	 * Schedules a new task.
	 * @param topic The topic of the task.
	 * @param method The method to be called.
	 * @param data The data to be passed to the method.
	 * @param options The options for the task.
	 * @param options.timeout The timeout for the task.
	 * @returns The result of the task.
	 */
	async request(
		topic: string,
		method: string,
		data?: TasqRequestData,
		{
			timeout = 10_000,
		}: {
			timeout?: number,
		} = {},
	): Promise<TasqResponseData> {
		const request_id = createId();
		const request_id_string = request_id.toString('hex');

		const redis_key = getRedisKey(topic);

		const request: TasqRedisRequest = [
			this.id,
			request_id,
			getTime() + timeout,
			method,
		];
		if (data) {
			request[4] = data;
		}

		// console.log('Sending request', request_id_string);

		const promise = Promise.race([
			new Promise<TasqResponseData>((resolve, reject) => {
				this.requests.set(
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
			new Promise<never>((_resolve, reject) => {
				setTimeout(
					() => {
						this.requests.delete(request_id_string);
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

		await this.redisClient.multi()
			.RPUSH(
				redis_key,
				CBOR.encode(request),
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

		return promise;
	}

	/**
	 * Handles a response to a task.
	 * @param message The message received.
	 */
	private onResponse(message: Buffer) {
		const [
			request_id,
			status,
			data,
		]: TasqRedisResponse = CBOR.decode(message);

		const request_id_string = request_id.toString('hex');
		// console.log('Received response', request_id_string);

		if (this.requests.has(request_id_string)) {
			const {
				state,
				resolve,
				reject,
			} = this.requests.get(request_id_string)!;

			this.requests.delete(request_id_string);

			switch (status) {
				case 0:
					resolve(data);
					break;

				case 1:
					reject(new TasqRequestRejectedError(state));
					break;

				case 2:
					reject(new TasqRequestUnknownMethodError(state));
					break;

				default:
					reject(new Error('Unknown response status.'));
			}
		}
	}

	/**
	 * Creates a new Tasq server.
	 * @param options The options for the server.
	 * @returns The Tasq server.
	 */
	serve(options: TasqServerOptions): TasqServer {
		const server = new TasqServer(
			this.redisClient,
			{
				redisSubClient: this.redisSubClient,
				...options,
			},
		);

		this.servers.add(server);

		return server;
	}

	/**
	 * Destroys the Tasq instance.
	 * @returns -
	 */
	async destroy(): Promise<void> {
		await this.redisSubClient.unsubscribe(
			getRedisChannelForResponse(this.id),
		);

		for (const server of this.servers) {
			// eslint-disable-next-line no-await-in-loop
			await server.destroy();
		}

		if (this.is_redis_sub_client_internal) {
			await this.redisSubClient.disconnect();
		}
	}
}

/**
 * Creates a new Tasq instance.
 * @param redisClient The Redis client.
 * @param options The options for the Tasq instance.
 * @returns The Tasq instance.
 */
export async function createTasq(
	redisClient: RedisClient,
	options: TasqOptions = {},
): Promise<Tasq> {
	const tasq = new Tasq(redisClient, options, symbol_no_new);
	// @ts-expect-error Accessing private property
	await tasq.initSubClient();

	return tasq;
}

export { TasqServer } from './server.js';
export type { TasqRequestData } from './types.js';

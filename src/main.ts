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
	namespace?: string;
}

export class Tasq {
	private id = createIdString();
	private client_pub: RedisClient;
	private client_sub: RedisClient;
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
	 * @param client The Redis client from "redis" package to be used.
	 * @param config The configuration for the Tasq instance.
	 */
	constructor(
		client: RedisClient,
		config: TasqOptions = {},
	) {
		if (typeof config.namespace === 'string') {
			this.id = `${config.namespace}:${this.id}`;
		}

		this.client_pub = client;

		this.client_sub = this.client_pub.duplicate();
		this.client_sub.on(
			'error',
			// eslint-disable-next-line no-console
			console.error,
		);

		// eslint-disable-next-line no-console
		this.prepareSubClient().catch(console.error);
	}

	/**
	 * Creates a new Redis client for the subscription.
	 * @returns -
	 */
	private async prepareSubClient() {
		await this.client_sub.connect();
		await this.client_sub.subscribe(
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

		await this.client_pub.multi()
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

		return Promise.race([
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
	 * @param options The options for the server.
	 * @returns The Tasq server.
	 */
	serve(options: TasqServerOptions): TasqServer {
		const server = new TasqServer(
			this.client_pub,
			options,
		);

		this.servers.add(server);

		return server;
	}

	/**
	 * Destroys the Tasq instance.
	 * @returns -
	 */
	async destroy() {
		await this.client_sub.unsubscribe();
		await this.client_sub.disconnect();

		for (const server of this.servers) {
			// eslint-disable-next-line no-await-in-loop
			await server.destroy();
		}
	}
}

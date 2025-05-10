import * as CBOR$1 from "cbor-x";
import * as CBOR from "cbor-x";
import { randomBytes } from "node:crypto";
import { commandOptions } from "redis";

//#region src/errors.ts
var TasqError = class extends Error {};
var TasqRequestError = class extends TasqError {
	state;
	constructor(state) {
		super();
		this.state = state;
	}
};
var TasqRequestTimeoutError = class extends TasqRequestError {
	message = "Request timeouted.";
};
var TasqRequestUnknownMethodError = class extends TasqRequestError {
	message = "Unknown method called.";
};
var TasqRequestRejectedError = class extends TasqRequestError {
	message = "Method failed to execute.";
	response_status;
	/**
	* @param state -
	* @param [response_status] -
	*/
	constructor(state, response_status) {
		super(state);
		this.response_status = response_status;
	}
};

//#endregion
//#region src/fns.ts
/**
* Returns current time in milliseconds since 1 Jan 2023 00:00:00 UTC.
* @returns -
*/
function getTime() {
	return Date.now() - 16725312e5;
}
/**
* Returns redis key contains tasks for the given topic.
* @param topic The topic of the task.
* @returns A redis key.
*/
function getRedisKey(topic) {
	return `@tasq:${topic}`;
}
/**
* Returns redis channel name to use in PUBLISH/SUBSCRIBE command to notify about new task added.
* @param topic The topic of the task.
* @returns A redis channel name.
*/
function getRedisChannelForRequest(topic) {
	return `@tasq:${topic}`;
}
/**
* Returns redis channel name to use in PUBLISH/SUBSCRIBE command to listen for responses.
* @param client_id The id of the client.
* @returns A redis channel name.
*/
function getRedisChannelForResponse(client_id) {
	return `@tasq:client:${client_id}`;
}

//#endregion
//#region src/id.ts
/**
* Generates a random ID.
* @returns The generated ID.
*/
function createId() {
	return randomBytes(6);
}
/**
* Generates a random ID.
* @returns The generated ID.
*/
function createIdString() {
	return createId().toString("base64").replaceAll("=", "");
}

//#endregion
//#region src/server.ts
var TasqServer = class {
	/** Redis client for executing commands. */
	redisClient;
	/** Redis client for subscribing to channels. */
	redisSubClient;
	/** Indicates if the redisSubClient was created internally. */
	is_redis_sub_client_internal = false;
	/** The default handler for the tasks. */
	handler;
	/** The handlers for the tasks. */
	handlers = {};
	/** The Redis key where the tasks are stored. */
	redis_key;
	/** The Redis channel where the tasks are published. */
	redis_channel;
	/** The number of processes are currently running. */
	processes = 0;
	/** The maximum number of processes to be run in parallel. */
	processes_max = 1;
	/**  Indicates if there are unresponded notifications. */
	has_unresponded_notification = false;
	constructor(redisClient, options) {
		this.redisClient = redisClient;
		if (options.redisSubClient) this.redisSubClient = options.redisSubClient;
		else {
			this.redisSubClient = redisClient.duplicate();
			this.is_redis_sub_client_internal = true;
		}
		if (options.handler) this.handler = options.handler;
		if (options.handlers) this.handlers = options.handlers;
		this.redis_key = getRedisKey(options.topic);
		this.redis_channel = getRedisChannelForRequest(options.topic);
		this.processes_max = options.threads ?? 1;
		this.initSubClient().catch(console.error);
	}
	/**
	* Creates a new Redis client for the subscription.
	* @returns -
	*/
	async initSubClient() {
		if (this.is_redis_sub_client_internal) {
			this.redisSubClient.on(
				"error",
				// eslint-disable-next-line no-console
				console.error
);
			await this.redisSubClient.connect();
		}
		await this.redisSubClient.subscribe(this.redis_channel, () => {
			this.has_unresponded_notification = true;
			this.schedule(true);
		});
		this.schedule();
	}
	/**
	* Schedules a new task execute.
	* @param [by_notification] - Indicates if the task was scheduled by a Redis message.
	*/
	schedule(by_notification = false) {
		this.execute(by_notification).catch(console.error);
	}
	/**
	* Gets a task from the queue and executes it.
	* @param [by_notification] - Indicates if the task was scheduled by a Redis message.
	* @returns -
	*/
	async execute(by_notification = false) {
		if (this.processes >= this.processes_max) return;
		this.processes++;
		if (by_notification) this.has_unresponded_notification = false;
		const task_buffer = await this.redisClient.LPOP(commandOptions({ returnBuffers: true }), this.redis_key);
		const has_task = Buffer.isBuffer(task_buffer);
		if (has_task) {
			const [client_id, request_id, ts_timeout, method, method_args] = CBOR$1.decode(task_buffer);
			if (getTime() < ts_timeout) {
				const response = [request_id, 0];
				const handler = this.handlers[method];
				if (typeof handler === "function") try {
					response[2] = await handler(method_args);
				} catch {
					response[1] = 1;
				}
				else if (typeof this.handler === "function") try {
					response[2] = await this.handler(method, method_args);
				} catch {
					response[1] = 1;
				}
				else response[1] = 2;
				await this.redisClient.publish(getRedisChannelForResponse(client_id), CBOR$1.encode(response));
			}
		}
		this.processes--;
		if (has_task || this.has_unresponded_notification) this.schedule(this.has_unresponded_notification);
	}
	/**
	* Destroys the server.
	* @returns -
	*/
	async destroy() {
		await this.redisSubClient.unsubscribe(this.redis_channel);
		if (this.is_redis_sub_client_internal) await this.redisSubClient.disconnect();
	}
};

//#endregion
//#region src/main.ts
const symbol_no_new = Symbol("no_new");
var Tasq = class {
	id = createIdString();
	redisClient;
	redisSubClient;
	is_redis_sub_client_internal = false;
	/** Active requests that are waiting for a response. */
	requests = new Map();
	servers = new Set();
	/**
	* @param redisClient The Redis client from "redis" package to be used.
	* @param options The configuration for the Tasq instance.
	* @param no_new Symbol to prevent instantiation.
	*/
	constructor(redisClient, options, no_new) {
		if (no_new !== symbol_no_new) throw new Error("Do not use new Tasq(...), use createTasq(...) instead.");
		if (typeof options.namespace === "string") this.id = `${options.namespace}:${this.id}`;
		this.redisClient = redisClient;
		if (options.redisSubClient) this.redisSubClient = options.redisSubClient;
		else {
			this.redisSubClient = redisClient.duplicate();
			this.is_redis_sub_client_internal = true;
		}
	}
	/**
	* Creates a new Redis client for the subscriptions.
	* @returns -
	*/
	async initSubClient() {
		if (this.is_redis_sub_client_internal) {
			this.redisSubClient.on(
				"error",
				// eslint-disable-next-line no-console
				console.error
);
			await this.redisSubClient.connect();
		}
		await this.redisSubClient.subscribe(getRedisChannelForResponse(this.id), (message) => {
			this.onResponse(message);
		}, true);
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
	async request(topic, method, data, { timeout = 1e4 } = {}) {
		const request_id = createId();
		const request_id_string = request_id.toString("hex");
		const redis_key = getRedisKey(topic);
		const request = [
			this.id,
			request_id,
			getTime() + timeout,
			method
		];
		if (data) request[4] = data;
		await this.redisClient.multi().RPUSH(redis_key, CBOR.encode(request)).PEXPIRE(redis_key, timeout).PUBLISH(getRedisChannelForRequest(topic), "").exec();
		return Promise.race([new Promise((resolve, reject) => {
			this.requests.set(request_id_string, {
				state: [
					topic,
					method,
					data
				],
				resolve,
				reject
			});
		}), new Promise((_resolve, reject) => {
			setTimeout(() => {
				this.requests.delete(request_id_string);
				reject(new TasqRequestTimeoutError([
					topic,
					method,
					data
				]));
			}, timeout);
		})]);
	}
	/**
	* Handles a response to a task.
	* @param message The message received.
	*/
	onResponse(message) {
		const [request_id, status, data] = CBOR.decode(message);
		const request_id_string = request_id.toString("hex");
		if (this.requests.has(request_id_string)) {
			const { state, resolve, reject } = this.requests.get(request_id_string);
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
				default: reject(new Error("Unknown response status."));
			}
			if (status === 0) resolve(data);
			else reject(new TasqRequestRejectedError(state, status));
		}
	}
	/**
	* Creates a new Tasq server.
	* @param options The options for the server.
	* @returns The Tasq server.
	*/
	serve(options) {
		const server = new TasqServer(this.redisClient, {
			redisSubClient: this.redisSubClient,
			...options
		});
		this.servers.add(server);
		return server;
	}
	/**
	* Destroys the Tasq instance.
	* @returns -
	*/
	async destroy() {
		await this.redisSubClient.unsubscribe(getRedisChannelForResponse(this.id));
		for (const server of this.servers) await server.destroy();
		if (this.is_redis_sub_client_internal) await this.redisSubClient.disconnect();
	}
};
/**
* Creates a new Tasq instance.
* @param redisClient The Redis client.
* @param options The options for the Tasq instance.
* @returns The Tasq instance.
*/
async function createTasq(redisClient, options = {}) {
	const tasq = new Tasq(redisClient, options, symbol_no_new);
	await tasq.initSubClient();
	return tasq;
}

//#endregion
export { Tasq, TasqServer, createTasq };
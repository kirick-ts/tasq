Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
// \0rolldown/runtime.js
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
		key = keys[i];
		if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
			get: ((k) => from[k]).bind(null, key),
			enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
		});
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule || !__hasOwnProp.call(mod, "default") ? __defProp(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));
let cbor_x = require("cbor-x");
cbor_x = __toESM(cbor_x, 1);
let node_crypto = require("node:crypto");
let redis = require("redis");
// src/errors.ts
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
};
var TasqRequestDestroyedError = class extends TasqRequestError {
	message = "Tasq instance was destroyed.";
};
// src/fns.ts
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
// src/id.ts
/**
* Generates a random ID.
* @returns The generated ID.
*/
function createId() {
	return (0, node_crypto.randomBytes)(6);
}
/**
* Generates a random ID.
* @returns The generated ID.
*/
function createIdString() {
	return createId().toString("base64url");
}
// src/server.ts
var TasqServer = class {
	/** Redis client for executing commands. */
	#redisClient;
	/** Redis client for subscribing to channels. */
	#redisSubClient;
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
	/** Indicates if the server was destroyed and must not take new tasks. */
	is_destroyed = false;
	/** Executions that are currently running. */
	executions = /* @__PURE__ */ new Set();
	constructor(redisClient, options) {
		this.#redisClient = redisClient;
		if (options.redisSubClient) this.#redisSubClient = options.redisSubClient;
		else {
			this.#redisSubClient = redisClient.duplicate();
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
			this.#redisSubClient.on("error", console.error);
			await this.#redisSubClient.connect();
		}
		await this.#redisSubClient.subscribe(this.redis_channel, () => {
			this.has_unresponded_notification = true;
			this.schedule(true);
		});
		this.schedule();
	}
	/**
	* Schedules a new task execute.
	* @param [was_notification] - Indicates if the task was scheduled by a Redis message.
	*/
	schedule(was_notification = false) {
		const execution = this.execute(was_notification).catch(console.error).finally(() => {
			this.executions.delete(execution);
		});
		this.executions.add(execution);
	}
	/**
	* Gets a task from the queue and executes it.
	* @param was_notification - Indicates if the task was scheduled by a Redis message.
	* @returns -
	*/
	async execute(was_notification = false) {
		Math.random().toString(36).slice(2, 11);
		if (this.is_destroyed || this.processes >= this.processes_max) return;
		this.processes++;
		if (was_notification) this.has_unresponded_notification = false;
		const task_buffer = await this.#redisClient.LPOP((0, redis.commandOptions)({ returnBuffers: true }), this.redis_key);
		const has_task = Buffer.isBuffer(task_buffer);
		if (has_task) {
			if (this.processes < this.processes_max) this.schedule();
			const [client_id, request_id, ts_timeout, method, method_args] = cbor_x.decode(task_buffer);
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
				await this.#redisClient.publish(getRedisChannelForResponse(client_id), cbor_x.encode(response));
			}
		}
		this.processes--;
		if (has_task || this.has_unresponded_notification) this.schedule(this.has_unresponded_notification);
	}
	/**
	* Destroys the server: it stops taking new tasks and waits for running ones.
	* @param is_forced - Do not wait for running tasks.
	* @returns -
	*/
	async destroy(is_forced = false) {
		this.is_destroyed = true;
		await this.#redisSubClient.unsubscribe(this.redis_channel);
		if (this.is_redis_sub_client_internal) await this.#redisSubClient.disconnect();
		if (!is_forced) await Promise.all(this.executions);
	}
};
// src/main.ts
const symbol_no_new = Symbol("no_new");
var Tasq = class {
	id = createIdString();
	redisClient;
	redisSubClient;
	is_redis_sub_client_internal = false;
	/** Active requests that are waiting for a response. */
	requests = /* @__PURE__ */ new Map();
	servers = /* @__PURE__ */ new Set();
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
			this.redisSubClient.on("error", console.error);
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
		const promise = new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.requests.delete(request_id_string);
				reject(new TasqRequestTimeoutError([
					topic,
					method,
					data
				]));
			}, timeout);
			this.requests.set(request_id_string, {
				state: [
					topic,
					method,
					data
				],
				timer,
				resolve,
				reject
			});
		});
		promise.catch(() => void 0);
		try {
			await this.redisClient.multi().RPUSH(redis_key, cbor_x.encode(request)).PEXPIRE(redis_key, timeout, "NX").PEXPIRE(redis_key, timeout, "GT").PUBLISH(getRedisChannelForRequest(topic), "").exec();
		} catch (error) {
			clearTimeout(this.requests.get(request_id_string)?.timer);
			this.requests.delete(request_id_string);
			throw error;
		}
		return promise;
	}
	/**
	* Handles a response to a task.
	* @param message The message received.
	*/
	onResponse(message) {
		const [request_id, status, data] = cbor_x.decode(message);
		const request_id_string = request_id.toString("hex");
		if (this.requests.has(request_id_string)) {
			const { state, timer, resolve, reject } = this.requests.get(request_id_string);
			clearTimeout(timer);
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
				default: reject(/* @__PURE__ */ new Error("Unknown response status."));
			}
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
	* Destroys the Tasq instance: rejects pending requests and destroys its servers.
	* @param is_forced - Do not wait for tasks running on the servers.
	* @returns -
	*/
	async destroy(is_forced = false) {
		await this.redisSubClient.unsubscribe(getRedisChannelForResponse(this.id));
		for (const { state, timer, reject } of this.requests.values()) {
			clearTimeout(timer);
			reject(new TasqRequestDestroyedError(state));
		}
		this.requests.clear();
		for (const server of this.servers) await server.destroy(is_forced);
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
exports.Tasq = Tasq;
exports.TasqError = TasqError;
exports.TasqRequestDestroyedError = TasqRequestDestroyedError;
exports.TasqRequestError = TasqRequestError;
exports.TasqRequestRejectedError = TasqRequestRejectedError;
exports.TasqRequestTimeoutError = TasqRequestTimeoutError;
exports.TasqRequestUnknownMethodError = TasqRequestUnknownMethodError;
exports.TasqServer = TasqServer;
exports.createTasq = createTasq;

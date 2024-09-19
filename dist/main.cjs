"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// dist/esm/main.js
var main_exports = {};
__export(main_exports, {
  Tasq: () => Tasq
});
module.exports = __toCommonJS(main_exports);
var CBOR2 = __toESM(require("cbor-x"), 1);

// dist/esm/errors.js
var TasqError = class extends Error {
};
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

// dist/esm/fns.js
function getTime() {
  return Date.now() - 16725312e5;
}
function getRedisKey(topic) {
  return `@tasq:${topic}`;
}
function getRedisChannelForRequest(topic) {
  return `@tasq:${topic}`;
}
function getRedisChannelForResponse(client_id) {
  return `@tasq:client:${client_id}`;
}

// dist/esm/id.js
var import_node_crypto = require("node:crypto");
function createId() {
  return (0, import_node_crypto.randomBytes)(6);
}
function createIdString() {
  return createId().toString("base64").replaceAll("=", "");
}

// dist/esm/server.js
var import_redis = require("redis");
var CBOR = __toESM(require("cbor-x"), 1);
var TasqServer = class {
  /** Redis client for executing commands. */
  client_pub;
  /** Redis client for subscribing to channels. */
  client_sub;
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
  constructor(client, { topic, threads = 1, handler, handlers }) {
    this.client_pub = client;
    this.client_sub = this.client_pub.duplicate();
    this.client_sub.on(
      "error",
      // eslint-disable-next-line no-console
      console.error
    );
    this.prepareSubClient().catch(console.error);
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
  async prepareSubClient() {
    await this.client_sub.connect();
    await this.client_sub.subscribe(this.redis_channel, () => {
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
    if (this.processes >= this.processes_max) {
      return;
    }
    this.processes++;
    if (by_notification) {
      this.has_unresponded_notification = false;
    }
    const task_buffer = await this.client_pub.LPOP((0, import_redis.commandOptions)({
      returnBuffers: true
    }), this.redis_key);
    const has_task = Buffer.isBuffer(task_buffer);
    if (has_task) {
      const [client_id, request_id, ts_timeout, method, method_args] = CBOR.decode(task_buffer);
      if (getTime() < ts_timeout) {
        const response = [
          request_id,
          0
        ];
        const handler = this.handlers[method];
        if (typeof handler === "function") {
          try {
            response[2] = await handler(method_args);
          } catch {
            response[1] = 1;
          }
        } else if (typeof this.handler === "function") {
          try {
            response[2] = await this.handler(method, method_args);
          } catch {
            response[1] = 1;
          }
        } else {
          response[1] = 2;
        }
        await this.client_pub.publish(getRedisChannelForResponse(client_id), CBOR.encode(response));
      }
    }
    this.processes--;
    if (has_task || this.has_unresponded_notification) {
      this.schedule(this.has_unresponded_notification);
    }
  }
  /**
   * Destroys the server.
   * @returns -
   */
  async destroy() {
    await this.client_sub.unsubscribe();
    await this.client_sub.disconnect();
  }
};

// dist/esm/main.js
var Tasq = class {
  id = createIdString();
  client_pub;
  client_sub;
  /** Active requests that are waiting for a response. */
  requests = /* @__PURE__ */ new Map();
  servers = /* @__PURE__ */ new Set();
  /**
   * @param client The Redis client from "redis" package to be used.
   * @param config The configuration for the Tasq instance.
   */
  constructor(client, config = {}) {
    if (typeof config.namespace === "string") {
      this.id = `${config.namespace}:${this.id}`;
    }
    this.client_pub = client;
    this.client_sub = this.client_pub.duplicate();
    this.client_sub.on(
      "error",
      // eslint-disable-next-line no-console
      console.error
    );
    this.prepareSubClient().catch(console.error);
  }
  /**
   * Creates a new Redis client for the subscription.
   * @returns -
   */
  async prepareSubClient() {
    await this.client_sub.connect();
    await this.client_sub.subscribe(getRedisChannelForResponse(this.id), (message) => {
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
    if (data) {
      request[4] = data;
    }
    await this.client_pub.multi().RPUSH(redis_key, CBOR2.encode(request)).PEXPIRE(redis_key, timeout).PUBLISH(getRedisChannelForRequest(topic), "").exec();
    return Promise.race([
      new Promise((resolve, reject) => {
        this.requests.set(request_id_string, {
          state: [
            topic,
            method,
            data
          ],
          resolve,
          reject
        });
      }),
      new Promise((_resolve, reject) => {
        setTimeout(() => {
          this.requests.delete(request_id_string);
          reject(new TasqRequestTimeoutError([
            topic,
            method,
            data
          ]));
        }, timeout);
      })
    ]);
  }
  /**
   * Handles a response to a task.
   * @param message The message received.
   */
  onResponse(message) {
    const [request_id, status, data] = CBOR2.decode(message);
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
        default:
          reject(new Error("Unknown response status."));
      }
      if (status === 0) {
        resolve(data);
      } else {
        reject(new TasqRequestRejectedError(state, status));
      }
    }
  }
  /**
   * Creates a new Tasq server.
   * @param options The options for the server.
   * @returns The Tasq server.
   */
  serve(options) {
    const server = new TasqServer(this.client_pub, options);
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
      await server.destroy();
    }
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Tasq
});

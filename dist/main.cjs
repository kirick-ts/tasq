var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.js
var main_exports = {};
__export(main_exports, {
  Tasq: () => Tasq
});
module.exports = __toCommonJS(main_exports);
var import_cbor_x2 = require("cbor-x");

// src/errors.js
var TasqError = class extends Error {
};
var TasqRequestError = class extends TasqError {
  /** @type {TasqAwaitingRequestState} */
  state;
  /**
   * @param {TasqAwaitingRequestState} state -
   */
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
  /** @type {number} */
  response_status;
  /**
   * @param {TasqAwaitingRequestState} state -
   * @param {number} [response_status] -
   */
  constructor(state, response_status) {
    super(state);
    this.response_status = response_status;
  }
};

// src/fns.js
function getTime() {
  return Date.now() - 16725312e5;
}
function getRedisKey(topic) {
  return `@tasq:${topic}`;
}
function getRedisChannelForRequest(topic) {
  return `@tasq:s:${topic}`;
}
function getRedisChannelForResponse(topic) {
  return `@tasq:c:${topic}`;
}

// src/id.js
var import_node_crypto = require("node:crypto");
function id_default() {
  return (0, import_node_crypto.randomBytes)(6);
}

// src/server.js
var import_redis = require("redis");
var import_cbor_x = require("cbor-x");
var TasqServer = class {
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
  constructor(client, {
    topic,
    threads = 1,
    handler,
    handlers
  }) {
    this.#client_pub = client;
    this.#prepareSubClient().catch((error) => {
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
      "error",
      (error) => {
        console.error(error);
      }
    );
    await this.#client_sub.connect();
    await this.#client_sub.subscribe(
      this.#redis_channel,
      () => {
        this.#has_unresponded_notification = true;
        this.#schedule(true);
      }
    );
    this.#schedule();
  }
  /**
   * Schedules a new task execute.
   * @param {boolean} [by_notification] - Indicates if the task was scheduled by a Redis message.
   */
  #schedule(by_notification = false) {
    this.#execute(by_notification).catch((error) => {
      console.error(error);
    });
  }
  /**
   * Gets a task from the queue and executes it.
   * @param {boolean} [by_notification] - Indicates if the task was scheduled by a Redis message.
   * @returns {Promise<void>}
   */
  async #execute(by_notification = false) {
    if (this.#processes >= this.#processes_max) {
      return;
    }
    this.#processes++;
    if (by_notification) {
      this.#has_unresponded_notification = false;
    }
    const task_buffer = await this.#client_pub.LPOP(
      (0, import_redis.commandOptions)({
        returnBuffers: true
      }),
      this.#redis_key
    );
    const has_task = Buffer.isBuffer(task_buffer);
    if (has_task) {
      const [
        client_id,
        request_id,
        ts_timeout,
        method,
        method_args = {}
      ] = (0, import_cbor_x.decode)(task_buffer);
      if (getTime() < ts_timeout) {
        const response = [
          request_id
        ];
        const handler = this.#handlers[method];
        if (typeof handler === "function") {
          try {
            response.push(
              0,
              await handler(method_args)
            );
          } catch {
            response.push(1);
          }
        } else if (typeof this.#handler === "function") {
          try {
            response.push(
              0,
              await this.#handler(
                method,
                method_args
              )
            );
          } catch {
            response.push(1);
          }
        } else {
          response.push(2);
        }
        await this.#client_pub.publish(
          getRedisChannelForResponse(client_id),
          (0, import_cbor_x.encode)(response)
        );
      }
    }
    this.#processes--;
    if (has_task || this.#has_unresponded_notification) {
      this.#schedule(
        this.#has_unresponded_notification
      );
    }
  }
  /**
   * Destroys the server.
   * @returns {Promise<void>}
   */
  async destroy() {
    await this.#client_sub.unsubscribe();
    await this.#client_sub.disconnect();
  }
};

// src/main.js
var Tasq = class {
  #id = id_default().toString("base64").replaceAll("=", "");
  /**
   * @type {import('redis').RedisClientType}
   */
  #client_pub;
  /**
   * @type {import('redis').RedisClientType}
   */
  #client_sub;
  /**
   * Active requests that are waiting for a response.
   * @type {Map<string, { state: TasqAwaitingRequestState, resolve: (value: any) => void, reject: (error: Error) => void }>}
   */
  #requests = /* @__PURE__ */ new Map();
  #servers = /* @__PURE__ */ new Set();
  /**
   * @param {import('redis').RedisClientType} client The Redis client from "redis" package to be used.
   */
  constructor(client) {
    this.#client_pub = client;
    this.#prepareSubClient().catch((error) => {
      console.error(error);
    });
  }
  /**
   * Creates a new Redis client for the subscription.
   * @returns {Promise<void>}
   */
  async #prepareSubClient() {
    this.#client_sub = this.#client_pub.duplicate();
    this.#client_sub.on(
      "error",
      (error) => {
        console.error(error);
      }
    );
    await this.#client_sub.connect();
    await this.#client_sub.subscribe(
      getRedisChannelForResponse(this.#id),
      (message) => {
        this.#onResponse(message);
      },
      true
      // receive buffers
    );
  }
  /**
   * Schedules a new task.
   * @param {string} topic The topic of the task.
   * @param {string} method The method to be called.
   * @param {TasqRequestData} [data] The data to be passed to the method.
   * @param {object} [options] The options for the task.
   * @param {number} [options.timeout] The timeout for the task.
   * @returns {Promise<TasqResponseData>} The result of the task.
   */
  async request(topic, method, data, {
    timeout = 1e4
  } = {}) {
    const request_id = id_default();
    const request_id_string = request_id.toString("hex");
    const redis_key = getRedisKey(topic);
    const request = [
      this.#id,
      request_id,
      getTime() + timeout,
      method
    ];
    if (data) {
      request[4] = data;
    }
    await this.#client_pub.multi().RPUSH(
      redis_key,
      (0, import_cbor_x2.encode)(request)
    ).PEXPIRE(
      redis_key,
      timeout
    ).PUBLISH(
      getRedisChannelForRequest(topic),
      ""
    ).exec();
    return Promise.race([
      new Promise((resolve, reject) => {
        this.#requests.set(
          request_id_string,
          {
            state: [
              topic,
              method,
              data
            ],
            resolve,
            reject
          }
        );
      }),
      new Promise((_resolve, reject) => {
        setTimeout(
          () => {
            this.#requests.delete(request_id_string);
            reject(
              new TasqRequestTimeoutError([
                topic,
                method,
                data
              ])
            );
          },
          timeout
        );
      })
    ]);
  }
  /**
   * Handles a response to a task.
   * @param {Buffer} message The message received.
   */
  #onResponse(message) {
    const [
      request_id,
      status,
      data
    ] = (0, import_cbor_x2.decode)(message);
    const request_id_string = request_id.toString("hex");
    if (this.#requests.has(request_id_string)) {
      const {
        state,
        resolve,
        reject
      } = this.#requests.get(request_id_string);
      this.#requests.delete(request_id_string);
      switch (status) {
        case 0:
          resolve(data);
          break;
        case 1:
          reject(
            new TasqRequestRejectedError(state)
          );
          break;
        case 2:
          reject(
            new TasqRequestUnknownMethodError(state)
          );
          break;
        default:
          reject(
            new Error("Unknown response status.")
          );
      }
      if (status === 0) {
        resolve(data);
      } else {
        reject(
          new TasqRequestRejectedError(
            state,
            status
          )
        );
      }
    }
  }
  /**
   * Creates a new Tasq server.
   * @param {TasqServerOptions} options The options for the server.
   * @returns {TasqServer} The Tasq server.
   */
  serve(options) {
    const server = new TasqServer(
      this.#client_pub,
      options
    );
    this.#servers.add(server);
    return server;
  }
  /**
   * Destroys the Tasq instance.
   * @returns {Promise<void>}
   */
  async destroy() {
    await this.#client_sub.unsubscribe();
    await this.#client_sub.disconnect();
    for (const server of this.#servers) {
      await server.destroy();
    }
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Tasq
});

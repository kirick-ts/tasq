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
  constructor(topic, method, data) {
    super();
    this.request = {
      topic,
      method,
      data
    };
  }
};
var TasqRequestTimeoutError = class extends TasqRequestError {
  message = "Request timeouted.";
};
var TasqRequestRejectedError = class extends TasqRequestError {
  message = "Method failed to execute.";
};
var TasqRequestUnknownMethodError = class extends TasqRequestError {
  message = "Unknown method called.";
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
  #client_pub;
  #client_sub;
  #handler;
  #handlers;
  #redis_key;
  #redis_channel;
  #processes = 0;
  #processes_max = 1;
  // Indicates if the scheduler was started, but rejected due to the maximum number of processes being reached.
  // In that case, the already running scheduler will start another scheduler when it finishes
  // __even if__ it got no tasks from Redis.
  #scheduler_bounced = false;
  /**
   * @param {import('redis').RedisClientType} client The Redis client from "redis" package to be used.
   * @param {object} options The options for the server.
   * @param {string} options.topic The topic to be used.
   * @param {number | undefined} [options.threads] The maximum number of parallel tasks to be executed. Defaults to 1.
   * @param {Function | undefined} [options.handler] The default handler to be used. If there is no handler for a method in the "handlers" object, this handler will be used.
   * @param {object | undefined} [options.handlers] The handlers to be used. The keys are the method names and the values are the handlers.
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
      "error",
      (error) => {
        console.error(error);
      }
    );
    await this.#client_sub.connect();
    await this.#client_sub.subscribe(
      this.#redis_channel,
      () => {
        this.#schedule();
      }
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
      this.#scheduler_bounced = true;
      return;
    }
    this.#processes++;
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
        let handler;
        let handler_args;
        if (typeof this.#handlers?.[method] === "function") {
          handler = this.#handlers[method];
          handler_args = [method_args];
        } else if (typeof this.#handler === "function") {
          handler = this.#handler;
          handler_args = [
            method,
            method_args
          ];
        }
        if (handler) {
          try {
            response.push(
              0,
              await handler(...handler_args)
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
    if (has_task || this.#scheduler_bounced) {
      this.#scheduler_bounced = false;
      this.#schedule();
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
   * @type {RedisClientType}
   */
  #client_pub;
  /**
   * @type {RedisClientType}
   */
  #client_sub;
  #requests = /* @__PURE__ */ new Map();
  #servers = /* @__PURE__ */ new Set();
  /**
   * @param {RedisClientType} client The Redis client from "redis" package to be used.
   */
  constructor(client) {
    this.#client_pub = client;
    this.#prepareSubClient().catch((error) => {
      console.error(error);
    });
  }
  /**
   * Creates a new Redis client for the subscription.
   * @private
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
   * @param {{[key: string]: any} | null | undefined} [data] The data to be passed to the method.
   * @param {object | undefined} [options] The options for the task.
   * @param {number | undefined} [options.timeout] The timeout for the task.
   * @returns {Promise<{[key: string]: any} | [*]>} The result of the task.
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
    if (data !== null && data !== void 0) {
      request.push(data);
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
            request: [
              topic,
              method,
              data
            ],
            resolve,
            reject
          }
        );
      }),
      new Promise((resolve, reject) => {
        setTimeout(
          () => {
            this.#requests.delete(request_id_string);
            reject(
              new TasqRequestTimeoutError(
                topic,
                method,
                data
              )
            );
          },
          timeout
        );
      })
    ]);
  }
  /**
   * Handles a response to a task.
   * @private
   * @param {Buffer} message The message received.
   * @returns {void}
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
        request,
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
            new TasqRequestRejectedError(...request)
          );
          break;
        case 2:
          reject(
            new TasqRequestUnknownMethodError(...request)
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
            status,
            ...request
          )
        );
      }
    }
  }
  /**
   * Creates a new Tasq server.
   * @param {{[key: string]: string}} options The options for the server.
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

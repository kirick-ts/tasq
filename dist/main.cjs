var __create = Object.create;
var __getProtoOf = Object.getPrototypeOf;
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __toESM = (mod, isNodeMode, target) => {
  target = mod != null ? __create(__getProtoOf(mod)) : {};
  const to = isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target;
  for (let key of __getOwnPropNames(mod))
    if (!__hasOwnProp.call(to, key))
      __defProp(to, key, {
        get: () => mod[key],
        enumerable: true
      });
  return to;
};
var __moduleCache = /* @__PURE__ */ new WeakMap;
var __toCommonJS = (from) => {
  var entry = __moduleCache.get(from), desc;
  if (entry)
    return entry;
  entry = __defProp({}, "__esModule", { value: true });
  if (from && typeof from === "object" || typeof from === "function")
    __getOwnPropNames(from).map((key) => !__hasOwnProp.call(entry, key) && __defProp(entry, key, {
      get: () => from[key],
      enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
    }));
  __moduleCache.set(from, entry);
  return entry;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {
      get: all[name],
      enumerable: true,
      configurable: true,
      set: (newValue) => all[name] = () => newValue
    });
};

// src/main.ts
var exports_main = {};
__export(exports_main, {
  Tasq: () => Tasq
});
module.exports = __toCommonJS(exports_main);
var CBOR2 = __toESM(require("cbor-x"));

// src/errors.ts
class TasqError extends Error {
}

class TasqRequestError extends TasqError {
  state;
  constructor(state) {
    super();
    this.state = state;
  }
}

class TasqRequestTimeoutError extends TasqRequestError {
  message = "Request timeouted.";
}

class TasqRequestUnknownMethodError extends TasqRequestError {
  message = "Unknown method called.";
}

class TasqRequestRejectedError extends TasqRequestError {
  message = "Method failed to execute.";
  response_status;
  constructor(state, response_status) {
    super(state);
    this.response_status = response_status;
  }
}

// src/fns.ts
function getTime() {
  return Date.now() - 1672531200000;
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

// src/id.ts
var import_node_crypto = require("node:crypto");
function createId() {
  return import_node_crypto.randomBytes(6);
}
function createIdString() {
  return createId().toString("base64").replaceAll("=", "");
}

// src/server.ts
var import_redis = require("redis");
var CBOR = __toESM(require("cbor-x"));
class TasqServer {
  client_pub;
  client_sub;
  handler;
  handlers = {};
  redis_key;
  redis_channel;
  processes = 0;
  processes_max = 1;
  has_unresponded_notification = false;
  constructor(client, {
    topic,
    threads = 1,
    handler,
    handlers
  }) {
    this.client_pub = client;
    this.client_sub = this.client_pub.duplicate();
    this.client_sub.on("error", console.error);
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
  async prepareSubClient() {
    await this.client_sub.connect();
    await this.client_sub.subscribe(this.redis_channel, () => {
      this.has_unresponded_notification = true;
      this.schedule(true);
    });
    this.schedule();
  }
  schedule(by_notification = false) {
    this.execute(by_notification).catch(console.error);
  }
  async execute(by_notification = false) {
    if (this.processes >= this.processes_max) {
      return;
    }
    this.processes++;
    if (by_notification) {
      this.has_unresponded_notification = false;
    }
    const task_buffer = await this.client_pub.LPOP(import_redis.commandOptions({
      returnBuffers: true
    }), this.redis_key);
    const has_task = Buffer.isBuffer(task_buffer);
    if (has_task) {
      const [
        client_id,
        request_id,
        ts_timeout,
        method,
        method_args
      ] = CBOR.decode(task_buffer);
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
  async destroy() {
    await this.client_sub.unsubscribe();
    await this.client_sub.disconnect();
  }
}

// src/main.ts
class Tasq {
  id = createIdString();
  client_pub;
  client_sub;
  requests = new Map;
  servers = new Set;
  constructor(client, config = {}) {
    if (typeof config.namespace === "string") {
      this.id = `${config.namespace}:${this.id}`;
    }
    this.client_pub = client;
    this.client_sub = this.client_pub.duplicate();
    this.client_sub.on("error", console.error);
    this.prepareSubClient().catch(console.error);
  }
  async prepareSubClient() {
    await this.client_sub.connect();
    await this.client_sub.subscribe(getRedisChannelForResponse(this.id), (message) => {
      this.onResponse(message);
    }, true);
  }
  async request(topic, method, data, {
    timeout = 1e4
  } = {}) {
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
  onResponse(message) {
    const [
      request_id,
      status,
      data
    ] = CBOR2.decode(message);
    const request_id_string = request_id.toString("hex");
    if (this.requests.has(request_id_string)) {
      const {
        state,
        resolve,
        reject
      } = this.requests.get(request_id_string);
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
  serve(options) {
    const server = new TasqServer(this.client_pub, options);
    this.servers.add(server);
    return server;
  }
  async destroy() {
    await this.client_sub.unsubscribe();
    await this.client_sub.disconnect();
    for (const server of this.servers) {
      await server.destroy();
    }
  }
}

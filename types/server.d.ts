export default class TasqServer {
    /**
     * @param {import('redis').RedisClientType} client The Redis client from "redis" package to be used.
     * @param {TasqServerOptions} options The options for the server.
     */
    constructor(client: import("redis").RedisClientType, { topic, threads, handler, handlers, }: TasqServerOptions);
    /**
     * Destroys the server.
     * @returns {Promise<void>}
     */
    destroy(): Promise<void>;
    #private;
}
export type TasqRequestData = import("./types.js").TasqRequestData;
export type TasqResponseData = import("./types.js").TasqResponseData;
export type TasqServerOptions = import("./types.js").TasqServerOptions;
export type TasqServerHandler = import("./types.js").TasqServerHandler;
export type TasqServerDefaultHandler = import("./types.js").TasqServerDefaultHandler;

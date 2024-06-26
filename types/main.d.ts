export class Tasq {
    /**
     * @param {import('redis').RedisClientType} client The Redis client from "redis" package to be used.
     */
    constructor(client: import("redis").RedisClientType);
    /**
     * Schedules a new task.
     * @param {string} topic The topic of the task.
     * @param {string} method The method to be called.
     * @param {TasqRequestData} [data] The data to be passed to the method.
     * @param {object} [options] The options for the task.
     * @param {number} [options.timeout] The timeout for the task.
     * @returns {Promise<TasqResponseData>} The result of the task.
     */
    request(topic: string, method: string, data?: TasqRequestData, { timeout, }?: {
        timeout?: number;
    }): Promise<TasqResponseData>;
    /**
     * Creates a new Tasq server.
     * @param {TasqServerOptions} options The options for the server.
     * @returns {TasqServer} The Tasq server.
     */
    serve(options: TasqServerOptions): TasqServer;
    /**
     * Destroys the Tasq instance.
     * @returns {Promise<void>}
     */
    destroy(): Promise<void>;
    #private;
}
export type TasqAwaitingRequestState = import("./types.js").TasqAwaitingRequestState;
export type TasqRedisRequest = import("./types.js").TasqRedisRequest;
export type TasqRedisResponse = import("./types.js").TasqRedisResponse;
export type TasqRequestData = import("./types.js").TasqRequestData;
export type TasqResponseData = import("./types.js").TasqResponseData;
export type TasqServerOptions = import("./types.js").TasqServerOptions;
import TasqServer from './server.js';

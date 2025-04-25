import { TasqServer, type TasqServerOptions } from './server.js';
import type { RedisClient, TasqRequestData, TasqResponseData } from './types.js';
interface TasqOptions {
    redisSubClient?: RedisClient;
    namespace?: string;
}
declare const symbol_no_new: unique symbol;
export declare class Tasq {
    private id;
    private redisClient;
    private redisSubClient;
    private is_redis_sub_client_internal;
    /** Active requests that are waiting for a response. */
    private requests;
    private servers;
    /**
     * @param redisClient The Redis client from "redis" package to be used.
     * @param options The configuration for the Tasq instance.
     * @param no_new Symbol to prevent instantiation.
     */
    constructor(redisClient: RedisClient, options: TasqOptions, no_new: typeof symbol_no_new);
    /**
     * Creates a new Redis client for the subscriptions.
     * @returns -
     */
    private initSubClient;
    /**
     * Schedules a new task.
     * @param topic The topic of the task.
     * @param method The method to be called.
     * @param data The data to be passed to the method.
     * @param options The options for the task.
     * @param options.timeout The timeout for the task.
     * @returns The result of the task.
     */
    request(topic: string, method: string, data?: TasqRequestData, { timeout, }?: {
        timeout?: number | undefined;
    }): Promise<TasqResponseData>;
    /**
     * Handles a response to a task.
     * @param message The message received.
     */
    private onResponse;
    /**
     * Creates a new Tasq server.
     * @param options The options for the server.
     * @returns The Tasq server.
     */
    serve(options: TasqServerOptions): TasqServer;
    /**
     * Destroys the Tasq instance.
     * @returns -
     */
    destroy(): Promise<void>;
}
/**
 * Creates a new Tasq instance.
 * @param redisClient The Redis client.
 * @param options The options for the Tasq instance.
 * @returns The Tasq instance.
 */
export declare function createTasq(redisClient: RedisClient, options?: TasqOptions): Promise<Tasq>;
export { TasqServer } from './server.js';
export type { TasqRequestData } from './types.js';

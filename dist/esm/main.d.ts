import { TasqServer, type TasqServerOptions } from './server.js';
import type { RedisClient, TasqRequestData, TasqResponseData } from './types.js';
interface TasqOptions {
    namespace?: string;
}
export declare class Tasq {
    private id;
    private client_pub;
    private client_sub;
    /** Active requests that are waiting for a response. */
    private requests;
    private servers;
    /**
     * @param client The Redis client from "redis" package to be used.
     * @param config The configuration for the Tasq instance.
     */
    constructor(client: RedisClient, config?: TasqOptions);
    /**
     * Creates a new Redis client for the subscription.
     * @returns -
     */
    private prepareSubClient;
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
export {};

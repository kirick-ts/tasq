import type { MaybePromise, RedisClient, TasqRequestData, TasqResponseData } from './types.js';
type TasqServerHandler = (args?: TasqRequestData) => MaybePromise<TasqResponseData>;
type TasqServerDefaultHandler = (method: string, args?: TasqRequestData) => MaybePromise<TasqResponseData>;
export interface TasqServerOptions {
    topic: string;
    threads?: number;
    handler?: TasqServerDefaultHandler;
    handlers?: Record<string, TasqServerHandler>;
}
export declare class TasqServer {
    /** Redis client for executing commands. */
    private client_pub;
    /** Redis client for subscribing to channels. */
    private client_sub;
    /** The default handler for the tasks. */
    private handler?;
    /** The handlers for the tasks. */
    private handlers;
    /** The Redis key where the tasks are stored. */
    private redis_key;
    /** The Redis channel where the tasks are published. */
    private redis_channel;
    /** The number of processes are currently running. */
    private processes;
    /** The maximum number of processes to be run in parallel. */
    private processes_max;
    /**  Indicates if there are unresponded notifications. */
    private has_unresponded_notification;
    constructor(client: RedisClient, { topic, threads, handler, handlers, }: TasqServerOptions);
    /**
     * Creates a new Redis client for the subscription.
     * @returns -
     */
    private prepareSubClient;
    /**
     * Schedules a new task execute.
     * @param [by_notification] - Indicates if the task was scheduled by a Redis message.
     */
    private schedule;
    /**
     * Gets a task from the queue and executes it.
     * @param [by_notification] - Indicates if the task was scheduled by a Redis message.
     * @returns -
     */
    private execute;
    /**
     * Destroys the server.
     * @returns -
     */
    destroy(): Promise<void>;
}
export {};

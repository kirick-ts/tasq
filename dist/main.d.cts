import { RedisClientType, RedisFunctions, RedisModules, RedisScripts } from "redis";

//#region src/types.d.ts
type MaybePromise<T> = T | Promise<T>;
type RedisClient = RedisClientType<RedisModules, RedisFunctions, RedisScripts>;
type TasqRequestData = Record<string, unknown> | unknown[] | undefined;
type TasqResponseData = boolean | number | string | Record<string, unknown> | unknown[] | undefined;

//#endregion
//#region src/server.d.ts
type TasqServerHandler = (args?: TasqRequestData) => MaybePromise<TasqResponseData>;
type TasqServerDefaultHandler = (method: string, args?: TasqRequestData) => MaybePromise<TasqResponseData>;
interface TasqServerOptions {
  redisSubClient?: RedisClient;
  topic: string;
  threads?: number;
  handler?: TasqServerDefaultHandler;
  handlers?: Record<string, TasqServerHandler>;
}
declare class TasqServer {
  /** Redis client for executing commands. */
  private redisClient;
  /** Redis client for subscribing to channels. */
  private redisSubClient;
  /** Indicates if the redisSubClient was created internally. */
  private is_redis_sub_client_internal;
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
  constructor(redisClient: RedisClient, options: TasqServerOptions);
  /**
  * Creates a new Redis client for the subscription.
  * @returns -
  */
  private initSubClient;
  /**
  * Schedules a new task execute.
  * @param [by_notification] - Indicates if the task was scheduled by a Redis message.
  */
  private schedule;
  /**
  * Gets a task from the queue and executes it.
  * @param by_notification - Indicates if the task was scheduled by a Redis message.
  * @returns -
  */
  private execute;
  /**
  * Destroys the server.
  * @returns -
  */
  destroy(): Promise<void>;
} //#endregion
//#region src/main.d.ts
interface TasqOptions {
  redisSubClient?: RedisClient;
  namespace?: string;
}
declare const symbol_no_new: symbol;
declare class Tasq {
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
  request(topic: string, method: string, data?: TasqRequestData, {
    timeout
  }?: {
    timeout?: number;
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
declare function createTasq(redisClient: RedisClient, options?: TasqOptions): Promise<Tasq>;

//#endregion
export { Tasq, TasqRequestData, TasqServer, createTasq };
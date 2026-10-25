import { RedisClientType, RedisFunctions, RedisModules, RedisScripts } from "redis";
type MaybePromise<T> = T | Promise<T>;
type RedisClient = RedisClientType<RedisModules, RedisFunctions, RedisScripts>;
type TasqRequestData = Record<string, unknown> | unknown[] | undefined;
type TasqResponseData = boolean | number | string | Record<string, unknown> | unknown[] | undefined;
type TasqAwaitingRequestState = [string, string, TasqRequestData?];
type TasqServerHandler = (args?: TasqRequestData) => MaybePromise<TasqResponseData>;
type TasqServerDefaultHandler = (method: string, args?: TasqRequestData) => MaybePromise<TasqResponseData>;
interface TasqServerOptions {
  redisSubClient?: RedisClient;
  topic: string;
  threads?: number;
  handler?: TasqServerDefaultHandler;
  handlers?: Record<string, TasqServerHandler>;
}
export declare class TasqServer {
  #private;
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
   * @param [was_notification] - Indicates if the task was scheduled by a Redis message.
   */
  private schedule;
  /**
   * Gets a task from the queue and executes it.
   * @param was_notification - Indicates if the task was scheduled by a Redis message.
   * @returns -
   */
  private execute;
  /**
   * Destroys the server.
   * @returns -
   */
  destroy(): Promise<void>;
}
export declare class TasqError extends Error {}
export declare class TasqRequestError extends TasqError {
  state: TasqAwaitingRequestState;
  constructor(state: TasqAwaitingRequestState);
}
export declare class TasqRequestTimeoutError extends TasqRequestError {
  override message: string;
}
export declare class TasqRequestUnknownMethodError extends TasqRequestError {
  override message: string;
}
export declare class TasqRequestRejectedError extends TasqRequestError {
  override message: string;
}
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
  request(topic: string, method: string, data?: TasqRequestData, { timeout }?: {
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
export declare function createTasq(redisClient: RedisClient, options?: TasqOptions): Promise<Tasq>;
export type { TasqRequestData };
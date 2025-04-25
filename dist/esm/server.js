import { commandOptions } from 'redis';
import * as CBOR from 'cbor-x';
import { getTime, getRedisKey, getRedisChannelForRequest, getRedisChannelForResponse, } from './fns.js';
export class TasqServer {
    /** Redis client for executing commands. */
    redisClient;
    /** Redis client for subscribing to channels. */
    redisSubClient;
    /** Indicates if the redisSubClient was created internally. */
    is_redis_sub_client_internal = false;
    /** The default handler for the tasks. */
    handler;
    /** The handlers for the tasks. */
    handlers = {};
    /** The Redis key where the tasks are stored. */
    redis_key;
    /** The Redis channel where the tasks are published. */
    redis_channel;
    /** The number of processes are currently running. */
    processes = 0;
    /** The maximum number of processes to be run in parallel. */
    processes_max = 1;
    /**  Indicates if there are unresponded notifications. */
    has_unresponded_notification = false;
    constructor(redisClient, options) {
        this.redisClient = redisClient;
        if (options.redisSubClient) {
            this.redisSubClient = options.redisSubClient;
        }
        else {
            this.redisSubClient = redisClient.duplicate();
            this.is_redis_sub_client_internal = true;
        }
        if (options.handler) {
            this.handler = options.handler;
        }
        if (options.handlers) {
            this.handlers = options.handlers;
        }
        this.redis_key = getRedisKey(options.topic);
        this.redis_channel = getRedisChannelForRequest(options.topic);
        this.processes_max = options.threads ?? 1;
        // eslint-disable-next-line no-console
        this.initSubClient().catch(console.error);
    }
    /**
     * Creates a new Redis client for the subscription.
     * @returns -
     */
    async initSubClient() {
        if (this.is_redis_sub_client_internal) {
            this.redisSubClient.on('error', 
            // eslint-disable-next-line no-console
            console.error);
            await this.redisSubClient.connect();
        }
        await this.redisSubClient.subscribe(this.redis_channel, () => {
            // console.log('New task available! Running scheduler...');
            this.has_unresponded_notification = true;
            this.schedule(true);
        });
        this.schedule();
    }
    /**
     * Schedules a new task execute.
     * @param [by_notification] - Indicates if the task was scheduled by a Redis message.
     */
    schedule(by_notification = false) {
        this.execute(by_notification)
            // eslint-disable-next-line no-console
            .catch(console.error);
    }
    /**
     * Gets a task from the queue and executes it.
     * @param [by_notification] - Indicates if the task was scheduled by a Redis message.
     * @returns -
     */
    async execute(by_notification = false) {
        // const _run_id = Math.random().toString(36).slice(2, 11);
        // console.log(`[run ${_run_id}] Started`);
        if (this.processes >= this.processes_max) {
            // console.log(`[run ${_run_id}] Maximum number of processes reached.`);
            return;
        }
        this.processes++;
        if (by_notification) {
            this.has_unresponded_notification = false;
        }
        const task_buffer = await this.redisClient.LPOP(commandOptions({
            returnBuffers: true,
        }), this.redis_key);
        const has_task = Buffer.isBuffer(task_buffer);
        if (has_task) {
            const [client_id, request_id, ts_timeout, method, method_args,] = CBOR.decode(task_buffer);
            if (getTime() < ts_timeout) {
                // console.log(`[run ${_run_id}] Running task with method "${method}" and arguments`, method_args);
                const response = [
                    request_id,
                    0,
                ];
                const handler = this.handlers[method];
                if (typeof handler === 'function') {
                    try {
                        response[2] = await handler(method_args);
                    }
                    catch {
                        response[1] = 1;
                    }
                }
                else if (typeof this.handler === 'function') {
                    try {
                        response[2] = await this.handler(method, method_args);
                    }
                    catch {
                        response[1] = 1;
                    }
                }
                else {
                    response[1] = 2;
                }
                await this.redisClient.publish(getRedisChannelForResponse(client_id), CBOR.encode(response));
            }
            // else {
            // 	console.log(`[run ${_run_id}] Task expired.`);
            // }
        }
        // else {
        // 	console.log(`[run ${_run_id}] No more tasks to execute.`);
        // }
        this.processes--;
        if (has_task
            || this.has_unresponded_notification) {
            // console.log(`[run ${_run_id}] Starting another scheduler...`);
            this.schedule(this.has_unresponded_notification);
        }
        // else {
        // 	console.log(`[run ${_run_id}] Scheduler finished.`);
        // }
    }
    /**
     * Destroys the server.
     * @returns -
     */
    async destroy() {
        await this.redisSubClient.unsubscribe(this.redis_channel);
        // if redisSubClient was created by the server itself, disconnect it
        if (this.is_redis_sub_client_internal) {
            await this.redisSubClient.disconnect();
        }
    }
}

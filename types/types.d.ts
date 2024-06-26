/**
 * @typedef {[string, string, Record<string, any>]} TasqAwaitingRequestState
 * @typedef {[string, Buffer, number, string, Record<string, any>?]} TasqRedisRequest
 * @typedef {[Buffer, number, (Record<string, any> | any[])?]} TasqRedisResponse
 * @typedef {Record<string, any>} TasqRequestData
 * @typedef {boolean | number | string | Record<string, any> | any[]} TasqResponseData
 */
/**
 * @typedef {object} TasqServerOptions
 * @property {string} topic The topic to be used.
 * @property {number} [threads] The maximum number of parallel tasks to be executed. Defaults to 1.
 * @property {TasqServerDefaultHandler} [handler] The default handler. If there is no handler for a method in the "handlers" object, this handler will be used.
 * @property {Record<string, TasqServerHandler>} [handlers] The handlers to be used. The keys are the method names and the values are the handlers.
 */
/**
 * @typedef {(args: TasqRequestData) => TasqResponseData | Promise<TasqResponseData>} TasqServerHandler
 * @typedef {(method: string, args: TasqRequestData) => TasqResponseData | Promise<TasqResponseData>} TasqServerDefaultHandler
 */
export const _: 1;
export type TasqAwaitingRequestState = [string, string, Record<string, any>];
export type TasqRedisRequest = [string, Buffer, number, string, Record<string, any>?];
export type TasqRedisResponse = [Buffer, number, (Record<string, any> | any[])?];
export type TasqRequestData = Record<string, any>;
export type TasqResponseData = boolean | number | string | Record<string, any> | any[];
export type TasqServerOptions = {
    /**
     * The topic to be used.
     */
    topic: string;
    /**
     * The maximum number of parallel tasks to be executed. Defaults to 1.
     */
    threads?: number;
    /**
     * The default handler. If there is no handler for a method in the "handlers" object, this handler will be used.
     */
    handler?: TasqServerDefaultHandler;
    /**
     * The handlers to be used. The keys are the method names and the values are the handlers.
     */
    handlers?: Record<string, TasqServerHandler>;
};
export type TasqServerHandler = (args: TasqRequestData) => TasqResponseData | Promise<TasqResponseData>;
export type TasqServerDefaultHandler = (method: string, args: TasqRequestData) => TasqResponseData | Promise<TasqResponseData>;

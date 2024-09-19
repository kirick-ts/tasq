import type { RedisClientType, RedisModules, RedisFunctions, RedisScripts } from 'redis';
export type MaybePromise<T> = T | Promise<T>;
export type RedisClient = RedisClientType<RedisModules, RedisFunctions, RedisScripts>;
export type TasqRequestData = Record<string, unknown> | unknown[] | undefined;
export type TasqRedisRequest = [
    string,
    Buffer,
    number,
    string,
    TasqRequestData?
];
export type TasqResponseData = boolean | number | string | Record<string, unknown> | unknown[] | undefined;
export type TasqRedisResponse = [
    Buffer,
    number,
    TasqResponseData?
];
export type TasqAwaitingRequestState = [
    string,
    string,
    TasqRequestData?
];

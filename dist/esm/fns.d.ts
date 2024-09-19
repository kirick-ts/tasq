/**
 * Returns current time in milliseconds since 1 Jan 2023 00:00:00 UTC.
 * @returns -
 */
export declare function getTime(): number;
/**
 * Returns redis key contains tasks for the given topic.
 * @param topic The topic of the task.
 * @returns A redis key.
 */
export declare function getRedisKey(topic: string): string;
/**
 * Returns redis channel name to use in PUBLISH/SUBSCRIBE command to notify about new task added.
 * @param topic The topic of the task.
 * @returns A redis channel name.
 */
export declare function getRedisChannelForRequest(topic: string): string;
/**
 * Returns redis channel name to use in PUBLISH/SUBSCRIBE command to listen for responses.
 * @param client_id The id of the client.
 * @returns A redis channel name.
 */
export declare function getRedisChannelForResponse(client_id: string): string;

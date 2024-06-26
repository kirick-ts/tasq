/**
 * Returns current time in milliseconds since 1 Jan 2023 00:00:00 UTC.
 * @returns {number} -
 */
export function getTime(): number;
/**
 * Returns redis key contains tasks for the given topic.
 * @param {string} topic The topic of the task.
 * @returns {string} A redis key.
 */
export function getRedisKey(topic: string): string;
/**
 * Returns redis channel name to use in PUBLISH/SUBSCRIBE command to notify about new task added.
 * @param {string} topic The topic of the task.
 * @returns {string} A redis channel name.
 */
export function getRedisChannelForRequest(topic: string): string;
/**
 * Returns redis channel name to use in PUBLISH/SUBSCRIBE command to listen for responses.
 * @param {string} topic The topic of the task (generally, ID of the client)
 * @returns {string} A redis channel name.
 */
export function getRedisChannelForResponse(topic: string): string;

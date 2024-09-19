/**
 * Returns current time in milliseconds since 1 Jan 2023 00:00:00 UTC.
 * @returns -
 */
export function getTime() {
    return Date.now() - 1_672_531_200_000;
}
/**
 * Returns redis key contains tasks for the given topic.
 * @param topic The topic of the task.
 * @returns A redis key.
 */
export function getRedisKey(topic) {
    return `@tasq:${topic}`;
}
/**
 * Returns redis channel name to use in PUBLISH/SUBSCRIBE command to notify about new task added.
 * @param topic The topic of the task.
 * @returns A redis channel name.
 */
export function getRedisChannelForRequest(topic) {
    return `@tasq:${topic}`;
}
/**
 * Returns redis channel name to use in PUBLISH/SUBSCRIBE command to listen for responses.
 * @param client_id The id of the client.
 * @returns A redis channel name.
 */
export function getRedisChannelForResponse(client_id) {
    return `@tasq:client:${client_id}`;
}


export function getTime() {
	return Date.now() - 1672531200000;
}

export function getRedisKey(topic) {
	return `@tasq:${topic}`;
}
export function getRedisChannelForRequest(topic) {
	return `@tasq:s:${topic}`;
}
export function getRedisChannelForResponse(topic) {
	return `@tasq:c:${topic}`;
}

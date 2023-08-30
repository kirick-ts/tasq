
export function getTime() {
	return Date.now() - 1_672_531_200_000;
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

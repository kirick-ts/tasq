
export function getTime() {
	return Date.now() - 1672531200000;
}

function encodeTopic(topic) {
	if (Buffer.isBuffer(topic)) {
		return '$' + topic.toString('base64').replaceAll('=', '');
	}

	return topic;
}
export function getRedisKey(topic) {
	return `@tasq:${encodeTopic(topic)}`;
}
export function getRedisChannelForRequest(topic) {
	return `@tasq:s:${encodeTopic(topic)}`;
}
export function getRedisChannelForResponse(topic) {
	return `@tasq:c:${encodeTopic(topic)}`;
}

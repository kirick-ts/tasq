/* eslint-disable jsdoc/require-jsdoc */

import { createClient } from 'redis';

export async function createRedisClient() {
	const redisClient = createClient({
		url: 'redis://localhost:29361',
	});

	await redisClient.connect();

	return redisClient;
}

import { createClient } from 'redis';

export const redisClient = createClient({
	socket: {
		port: Number.parseInt(process.env.REDIS_PORT ?? '-1'),
	},
});

await redisClient.connect();
await redisClient.FLUSHDB();

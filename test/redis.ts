import { createClient } from 'redis';
import type { RedisClient } from '../src/types.js';

/**
 * Creates a client connected to the test Redis server.
 * @param name The connection name. Connections Tasq duplicates from this client get the same name.
 * @returns The connected client.
 */
export async function createRedisClient(name?: string): Promise<RedisClient> {
	const redisClient = createClient({
		socket: {
			port: 16379,
		},
		name,
	});

	await redisClient.connect();

	return redisClient;
}

/**
 * Counts connections to Redis with the given name.
 * @param redisClient Any connected client.
 * @param name The connection name.
 * @returns The number of connections.
 */
export async function countConnections(
	redisClient: RedisClient,
	name: string,
): Promise<number> {
	const connections = await redisClient.CLIENT_LIST();

	return connections.filter((connection) => connection.name === name).length;
}

import { afterAll, expect, test } from 'vitest';
import { createTasq } from '../src/main.js';
import type { TasqRequestData } from '../src/types.js';
import { createRedisClient } from './redis.js';
import { createGate, createTopic, waitFor } from './utils.js';

// every server works like a separate service, with its own connection
const redisClient = await createRedisClient();
const redisClientA = await createRedisClient();
const redisClientB = await createRedisClient();
const tasq = await createTasq(redisClient);
const tasqA = await createTasq(redisClientA);
const tasqB = await createTasq(redisClientB);

afterAll(async () => {
	await tasq.destroy();
	await tasqA.destroy();
	await tasqB.destroy();
	await redisClient.quit();
	await redisClientA.quit();
	await redisClientB.quit();
});

test('share tasks and run each task once', async () => {
	const topic = createTopic();
	const gate = createGate();
	const busy_servers = new Set<string>();
	const calls: TasqRequestData[] = [];

	for (const [server, instance] of [
		['a', tasqA],
		['b', tasqB],
	] as const) {
		instance.serve({
			topic,
			handlers: {
				async work(args) {
					busy_servers.add(server);
					await gate.promise;
					calls.push(args);

					return server;
				},
			},
		});
	}

	const promise = Promise.all(
		[0, 1, 2, 3, 4, 5].map((n) => tasq.request(topic, 'work', { n })),
	);

	// each server runs one task at a time, so both have to take a task
	await waitFor(() => busy_servers.size === 2);
	gate.open();

	const responses = await promise;

	expect(new Set(responses)).toStrictEqual(new Set(['a', 'b']));
	// every task ran exactly once
	expect(calls).toHaveLength(6);
	expect(calls).toStrictEqual(
		expect.arrayContaining([
			{ n: 0 },
			{ n: 1 },
			{ n: 2 },
			{ n: 3 },
			{ n: 4 },
			{ n: 5 },
		]),
	);
});

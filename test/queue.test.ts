import { afterAll, describe, expect, test } from 'vitest';
import { getRedisKey } from '../src/fns.js';
import { createTasq, TasqRequestTimeoutError } from '../src/main.js';
import type { TasqRequestData } from '../src/types.js';
import { createRedisClient } from './redis.js';
import { createTopic, sleep } from './utils.js';

const redisClient = await createRedisClient();
const tasq = await createTasq(redisClient);

afterAll(async () => {
	await tasq.destroy();
	await redisClient.quit();
});

describe('waiting tasks', () => {
	test('processed once a server starts', async () => {
		const topic = createTopic();
		const promise = Promise.all(
			[1, 2, 3].map((n) => tasq.request(topic, 'echo', { n })),
		);

		expect(await redisClient.LLEN(getRedisKey(topic))).toBe(3);

		tasq.serve({
			topic,
			handlers: {
				echo: (args) => args,
			},
		});

		await expect(promise).resolves.toStrictEqual([
			{ n: 1 },
			{ n: 2 },
			{ n: 3 },
		]);
	});

	test('skipped by the server after they expire', async () => {
		const topic = createTopic();
		const expired = tasq.request(topic, 'record', { n: 1 }, { timeout: 100 });
		const alive = tasq.request(topic, 'record', { n: 2 }, { timeout: 5000 });

		await expect(expired).rejects.toBeInstanceOf(TasqRequestTimeoutError);
		// timers can fire up to 1 ms before the wall-clock deadline that the server checks
		await sleep(10);
		// the longer timeout keeps the queue alive, so the expired task is still there
		expect(await redisClient.LLEN(getRedisKey(topic))).toBe(2);

		const handled: TasqRequestData[] = [];
		tasq.serve({
			topic,
			handlers: {
				record(args) {
					handled.push(args);

					return 'OK';
				},
			},
		});

		await expect(alive).resolves.toBe('OK');
		expect(handled).toStrictEqual([{ n: 2 }]);
	});
});

describe('TTL', () => {
	// nobody serves these topics, so tasks stay in the queue until it expires

	test('set on a new queue', async () => {
		const topic = createTopic();
		const results = Promise.allSettled([
			tasq.request(topic, 'noop', undefined, { timeout: 300 }),
		]);

		const ttl = await redisClient.PTTL(getRedisKey(topic));

		expect(ttl).toBeGreaterThan(0);
		expect(ttl).toBeLessThanOrEqual(300);

		await results;
	});

	test('not shortened by a shorter request', async () => {
		const topic = createTopic();
		const results = Promise.allSettled([
			tasq.request(topic, 'noop', undefined, { timeout: 600 }),
			tasq.request(topic, 'noop', undefined, { timeout: 100 }),
		]);

		const ttl = await redisClient.PTTL(getRedisKey(topic));

		expect(ttl).toBeGreaterThan(300);

		await results;
	});

	test('extended by a longer request', async () => {
		const topic = createTopic();
		const results = Promise.allSettled([
			tasq.request(topic, 'noop', undefined, { timeout: 100 }),
			tasq.request(topic, 'noop', undefined, { timeout: 600 }),
		]);

		const ttl = await redisClient.PTTL(getRedisKey(topic));

		expect(ttl).toBeGreaterThan(300);

		await results;
	});
});

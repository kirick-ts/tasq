import { randomUUID } from 'node:crypto';
import { afterAll, expect, test } from 'vitest';
import { getRedisChannelForResponse } from '../src/fns.js';
import { createTasq, TasqRequestTimeoutError } from '../src/main.js';
import { createRedisClient } from './redis.js';
import { createGate, createTopic } from './utils.js';

const redisClient = await createRedisClient();
const tasqServer = await createTasq(redisClient);
const tasqA = await createTasq(redisClient);
const tasqB = await createTasq(redisClient);

afterAll(async () => {
	await tasqServer.destroy();
	await tasqA.destroy();
	await tasqB.destroy();
	await redisClient.quit();
});

test('each client gets responses to its own requests', async () => {
	const topic = createTopic();
	tasqServer.serve({
		topic,
		threads: 4,
		handlers: {
			echo: (args) => args,
		},
	});

	const promises = [];
	const expected = [];
	for (let n = 0; n < 20; n++) {
		for (const [client, tasq] of [
			['a', tasqA],
			['b', tasqB],
		] as const) {
			// a response lost to the other client would fail the test by timeout
			promises.push(
				tasq.request(topic, 'echo', { client, n }, { timeout: 2000 }),
			);
			expected.push({ client, n });
		}
	}

	await expect(Promise.all(promises)).resolves.toStrictEqual(expected);
});

test('reply after the timeout is ignored', async () => {
	const topic = createTopic();
	const gate = createGate();
	tasqServer.serve({
		topic,
		handlers: {
			async slow() {
				await gate.promise;

				return 'Too late';
			},
			ping: () => 'pong',
		},
	});

	const promise = tasqA.request(topic, 'slow', undefined, { timeout: 100 });

	await expect(promise).rejects.toBeInstanceOf(TasqRequestTimeoutError);

	gate.open();

	// the server runs one task at a time, so the late reply is sent before this one
	await expect(tasqA.request(topic, 'ping')).resolves.toBe('pong');
});

test('namespaced client', async () => {
	const namespace = randomUUID();
	const tasqNamespaced = await createTasq(redisClient, { namespace });
	const topic = createTopic();
	tasqServer.serve({
		topic,
		handlers: {
			ping: () => 'pong',
		},
	});

	await expect(tasqNamespaced.request(topic, 'ping')).resolves.toBe('pong');
	// the namespace is a part of the channel the client gets responses from
	await expect(
		redisClient.PUBSUB_CHANNELS(getRedisChannelForResponse(`${namespace}:*`)),
	).resolves.toHaveLength(1);

	await tasqNamespaced.destroy();
});

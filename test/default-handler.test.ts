import { afterAll, expect, test } from 'vitest';
import { createTasq, TasqRequestRejectedError } from '../src/main.js';
import { createRedisClient } from './redis.js';
import { createTopic } from './utils.js';

const redisClient = await createRedisClient();
const tasq = await createTasq(redisClient);

afterAll(async () => {
	await tasq.destroy();
	await redisClient.quit();
});

test('receives method name and arguments', async () => {
	const topic = createTopic();
	tasq.serve({
		topic,
		handler(method, args) {
			return { method, args };
		},
	});

	const response = await tasq.request(topic, 'anyMethod', { id: 1 });

	expect(response).toStrictEqual({
		method: 'anyMethod',
		args: { id: 1 },
	});
});

test('used only for methods without own handler', async () => {
	const topic = createTopic();
	tasq.serve({
		topic,
		handlers: {
			known: () => 'specific',
		},
		handler: () => 'default',
	});

	await expect(tasq.request(topic, 'known')).resolves.toBe('specific');
	await expect(tasq.request(topic, 'unknown')).resolves.toBe('default');
});

test('default handler that throws', async () => {
	const topic = createTopic();
	tasq.serve({
		topic,
		handler() {
			throw new Error('Test error.');
		},
	});

	const promise = tasq.request(topic, 'anyMethod');

	await expect(promise).rejects.toBeInstanceOf(TasqRequestRejectedError);
});

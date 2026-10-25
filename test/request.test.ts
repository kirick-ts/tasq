import { afterAll, describe, expect, test } from 'vitest';
import {
	createTasq,
	TasqRequestRejectedError,
	TasqRequestTimeoutError,
	TasqRequestUnknownMethodError,
} from '../src/main.js';
import { createRedisClient } from './redis.js';
import { createGate, createTopic, sleep, waitFor } from './utils.js';

const redisClient = await createRedisClient();
const tasq = await createTasq(redisClient);

const topic = createTopic();
tasq.serve({
	topic,
	handlers: {
		echo(args) {
			if (Array.isArray(args)) {
				throw new TypeError('Invalid args.');
			}

			return `Hello, ${args?.name ?? 'world'}!`;
		},
		userSync() {
			return {
				id: 1,
				name: 'Tasq',
			};
		},
		async userAsync() {
			await sleep(20);

			return {
				id: 1,
				name: 'Tasq',
			};
		},
		error() {
			throw new Error('Test error.');
		},
	},
});

afterAll(async () => {
	await tasq.destroy();
	await redisClient.quit();
});

describe('success', () => {
	test('method returning string', async () => {
		const response = await tasq.request(topic, 'echo');

		expect(response).toBe('Hello, world!');
	});

	test('method returning string from argument', async () => {
		const response = await tasq.request(topic, 'echo', { name: 'Tasq' });

		expect(response).toBe('Hello, Tasq!');
	});

	test('method returning object (sync)', async () => {
		const response = await tasq.request(topic, 'userSync');

		expect(response).toStrictEqual({
			id: 1,
			name: 'Tasq',
		});
	});

	test('method returning object (async)', async () => {
		const response = await tasq.request(topic, 'userAsync');

		expect(response).toStrictEqual({
			id: 1,
			name: 'Tasq',
		});
	});

	test('slow method finishing within the timeout', async () => {
		const slow_topic = createTopic();
		const gate = createGate();
		let is_started = false;
		tasq.serve({
			topic: slow_topic,
			handlers: {
				async slow() {
					is_started = true;
					await gate.promise;

					return 'OK';
				},
			},
		});

		const promise = tasq.request(slow_topic, 'slow', undefined, {
			timeout: 5000,
		});

		await waitFor(() => is_started);
		gate.open();

		await expect(promise).resolves.toBe('OK');
	});
});

describe('errors', () => {
	test('unknown method', async () => {
		const promise = tasq.request(topic, 'not-exists');

		await expect(promise).rejects.toBeInstanceOf(TasqRequestUnknownMethodError);
		await expect(promise).rejects.toThrow('Unknown method called.');
	});

	test('method that throws', async () => {
		const promise = tasq.request(topic, 'error');

		await expect(promise).rejects.toBeInstanceOf(TasqRequestRejectedError);
		await expect(promise).rejects.toThrow('Method failed to execute.');
	});

	test('nobody answering in time', async () => {
		// nobody serves this topic
		const promise = tasq.request(createTopic(), 'echo', undefined, {
			timeout: 100,
		});

		await expect(promise).rejects.toBeInstanceOf(TasqRequestTimeoutError);
		await expect(promise).rejects.toThrow('Request timeouted.');
	});
});

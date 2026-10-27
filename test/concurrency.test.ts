import { afterAll, expect, test } from 'vitest';
import { getRedisChannelForRequest, getRedisKey } from '../src/fns.js';
import {
	createTasq,
	TasqRequestRejectedError,
	TasqRequestTimeoutError,
} from '../src/main.js';
import type { TasqServerOptions } from '../src/server.js';
import { createRedisClient } from './redis.js';
import { createGate, createTopic, sleep, waitFor } from './utils.js';

const redisClient = await createRedisClient();
const tasq = await createTasq(redisClient);

afterAll(async () => {
	await tasq.destroy();
	await redisClient.quit();
});

/**
 * Checks that a server runs no more than the expected number of tasks at once.
 * @param options -
 * @param options.threads The `threads` option of the server.
 * @param options.expected The expected number of tasks running at once.
 * @param options.is_queued_before_start Whether tasks are queued before the server starts.
 */
async function expectRunningAtOnce({
	threads,
	expected,
	is_queued_before_start = false,
}: {
	threads?: number;
	expected: number;
	is_queued_before_start?: boolean;
}) {
	const topic = createTopic();
	const redis_key = getRedisKey(topic);
	const gate = createGate();
	let running = 0;
	let running_max = 0;
	const server_options: TasqServerOptions = {
		topic,
		threads,
		handlers: {
			async block() {
				running++;
				running_max = Math.max(running_max, running);
				await gate.promise;
				running--;

				return 'OK';
			},
		},
	};

	if (!is_queued_before_start) {
		tasq.serve(server_options);

		// otherwise the server could miss notifications about new tasks
		const channel = getRedisChannelForRequest(topic);
		await waitFor(async () => {
			const subscribers = await redisClient.PUBSUB_NUMSUB(channel);

			return subscribers[channel] === 1;
		});
	}

	const promise = Promise.all(
		Array.from({ length: expected + 1 }, () => tasq.request(topic, 'block')),
	);

	if (is_queued_before_start) {
		expect(await redisClient.LLEN(redis_key)).toBe(expected + 1);

		tasq.serve(server_options);
	}

	// all threads are busy and one task waits in the queue
	await waitFor(
		async () =>
			running === expected && (await redisClient.LLEN(redis_key)) === 1,
	);
	// give a server that ignores the limit a chance to start the waiting task
	await sleep(50);
	expect(running).toBe(expected);
	expect(await redisClient.LLEN(redis_key)).toBe(1);

	gate.open();

	await expect(promise).resolves.toHaveLength(expected + 1);
	expect(running_max).toBe(expected);
}

test('one task at a time by default', async () => {
	await expectRunningAtOnce({ expected: 1 });
});

test('up to `threads` tasks at once', async () => {
	await expectRunningAtOnce({ threads: 3, expected: 3 });
});

test('up to `threads` tasks at once when tasks are queued before the server starts', async () => {
	await expectRunningAtOnce({
		threads: 3,
		expected: 3,
		is_queued_before_start: true,
	});
});

test('500 requests with mixed results', async () => {
	const topic = createTopic();
	const gate = createGate();
	tasq.serve({
		topic,
		// more threads than blocked tasks, so blocked tasks never delay the rest
		threads: 64,
		handlers: {
			async result(args) {
				if (Array.isArray(args)) {
					throw new TypeError('Invalid args.');
				}

				switch (args?.expected_result) {
					case 'reply':
						return 'OK';
					case 'throw':
						throw new Error('Test error.');
					case 'timeout':
						await gate.promise;
						return 'Too late';
					default:
						throw new TypeError('Invalid args.');
				}
			},
		},
	});

	const expected_results = Array.from({ length: 500 }, (_, index) => {
		if (index % 10 === 0) {
			return 'timeout';
		}

		return index % 3 === 0 ? 'throw' : 'reply';
	});

	const results = await Promise.allSettled(
		expected_results.map((expected_result) =>
			tasq.request(
				topic,
				'result',
				{ expected_result },
				// blocked tasks never answer in time, the rest have plenty of time even on a slow machine
				{ timeout: expected_result === 'timeout' ? 200 : 10_000 },
			),
		),
	);

	for (const [index, result] of results.entries()) {
		switch (expected_results[index]) {
			case 'reply':
				expect(result).toStrictEqual({
					status: 'fulfilled',
					value: 'OK',
				});
				break;

			case 'throw':
				expect(result.status).toBe('rejected');
				if (result.status === 'rejected') {
					expect(result.reason).toBeInstanceOf(TasqRequestRejectedError);
				}

				break;

			case 'timeout':
				expect(result.status).toBe('rejected');
				if (result.status === 'rejected') {
					expect(result.reason).toBeInstanceOf(TasqRequestTimeoutError);
				}

				break;

			default:
				throw new Error(`Unexpected result at index ${index}.`);
		}
	}

	// tasq.destroy() waits for blocked tasks, so let them finish
	gate.open();
});

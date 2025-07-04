/* eslint-disable jsdoc/require-jsdoc */

import {
	afterAll,
	describe,
	test,
	expect,
} from 'vitest';
import { tasqServer } from '../test/server.js';
import {
	TasqRequestRejectedError,
	TasqRequestTimeoutError,
	TasqRequestUnknownMethodError,
} from './errors.js';
import { redisClient } from '../test/redis.js';
import { createTasq } from './main.js';
import type { TasqResponseData } from './types.js';

const tasqClient = await createTasq(redisClient);

function asyncTimeout(ms: number) {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

afterAll(async () => {
	await tasqServer.destroy();
	await tasqClient.destroy();
	await redisClient.disconnect();
});

describe('success', () => {
	test('method returning string', async () => {
		const response = await tasqClient.request('test', 'echo');

		expect(response).toBe('Hello, world!');
	});

	test('method returning string from argument', async () => {
		const response = await tasqClient.request(
			'test',
			'echo',
			{ name: 'Tasq' },
		);

		expect(response).toBe('Hello, Tasq!');
	});

	test('method returning object (sync)', async () => {
		const response = await tasqClient.request('test', 'userSync');

		expect(response).toStrictEqual({
			id: 1,
			name: 'Tasq',
		});
	});

	test('method returning object (async)', async () => {
		const response = await tasqClient.request('test', 'userAsync');

		expect(response).toStrictEqual({
			id: 1,
			name: 'Tasq',
		});
	});

	test('custom request timeout', async () => {
		const response = await tasqClient.request(
			'test',
			'slow',
			undefined,
			{
				timeout: 1000,
			},
		);

		expect(response).toBe('OK');
	});
});

describe('errors', () => {
	test('unknown method', async () => {
		const promise = tasqClient.request('test', 'not-exists');

		await expect(promise).rejects.toBeInstanceOf(TasqRequestUnknownMethodError);
		await expect(promise).rejects.toThrow('Unknown method called.');
	});

	test('method running too slow', async () => {
		const promise = tasqClient.request(
			'test',
			'slow',
			undefined,
			{
				timeout: 200,
			},
		);

		await expect(promise).rejects.toBeInstanceOf(TasqRequestTimeoutError);
	});

	test('method that throws', async () => {
		const promise = tasqClient.request('test', 'error');

		await expect(promise).rejects.toBeInstanceOf(TasqRequestRejectedError);
		await expect(promise).rejects.toThrow('Method failed to execute.');
	});
});

describe('internal things', () => {
	test('running 2 tasks in parallel and scheduling 3rd task', async () => {
		// should wait for task from "method running too slow" test to complete on the server
		// it is still running there despite we threw an error on the client side
		await asyncTimeout(500);

		const performance_start = performance.now();

		const result = await Promise.all([
			tasqClient.request('test', 'timeout').then(() => performance.now() - performance_start),
			tasqClient.request('test', 'timeout').then(() => performance.now() - performance_start),
			tasqClient.request('test', 'timeout').then(() => performance.now() - performance_start),
		]);

		// console.log('result', result);

		// first 2 tasks should be executed in parallel
		expect(
			result[1] - result[0],
		).toBeLessThan(1);

		// execution of 3rd task should be delayed until one of the first 2 tasks is finished
		expect(
			result[2] - result[1],
		).toBeGreaterThan(100);
	});

	// FIXME wait for bun to support options as the second argument
	test('load server', async () => {
		const expected_results: ('throw' | 'timeout' | 'reply')[] = [];
		const promises: Promise<PromiseSettledResult<TasqResponseData>>[] = [];
		for (let run_id = 1; run_id <= 500; run_id++) {
			// const value = Math.random();
			// const expected_result = value < 0.333
			// 	? 'throw'
			// 	: (value < 0.667
			// 		? 'timeout'
			// 		: 'reply');
			const expected_result = run_id % 10 === 0
				? 'timeout'
				: (Math.random() < 0.5
					? 'throw'
					: 'reply');
			// const expected_result = 'throw';

			expected_results.push(expected_result);

			promises.push(
				tasqClient.request(
					'test',
					'randomResult',
					{ expected_result },
					{ timeout: 180 },
				)
					// have to await promises here because if promise rejects before we got to await Promise.allSettled(), it throws to runtime.
					.then((value) => {
						return {
							status: 'fulfilled' as const,
							value,
						};
					})
					.catch((error) => {
						return {
							status: 'rejected' as const,
							reason: error,
						};
					}),
			);

			if (expected_result === 'timeout') {
				// eslint-disable-next-line no-await-in-loop
				await asyncTimeout(120);
			}
		}

		const results = await Promise.all(promises);
		for (const [ index, result ] of results.entries()) {
			const expected_result = expected_results[index];
			switch (expected_results[index]) {
				case 'reply':
					// check entire object to log all properties from it
					expect(result).toStrictEqual({
						status: 'fulfilled',
						value: 'OK',
					});
					break;

				case 'timeout':
					expect(result.status).toBe('rejected');
					// type guard
					if (result.status === 'rejected') {
						expect(result.reason).toBeInstanceOf(TasqRequestTimeoutError);
					}
					break;

				case 'throw':
					expect(result.status).toBe('rejected');
					// type guard
					if (result.status === 'rejected') {
						expect(result.reason).toBeInstanceOf(TasqRequestRejectedError);
					}
					break;

				default:
					throw new Error(`Unexpected result: ${expected_result}`);
			}
		}
	}, { timeout: 25_000 });
});

describe('namespaced client', async () => {
	const tasqClientNamespaced = await createTasq(
		redisClient,
		{
			namespace: 'test',
		},
	);

	test('method returning string', async () => {
		const response = await tasqClientNamespaced.request('test', 'echo');

		expect(response).toBe('Hello, world!');
	});
});

// describe('last one', () => {
// 	test('server destroy', async () => {
// 		await tasqServer.destroy();

// 		const promise = tasqClient.request('test', 'userSync', undefined, { timeout: 100 });
// 		expect(promise).rejects.toThrow();
// 	});
// });

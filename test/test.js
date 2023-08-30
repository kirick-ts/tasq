/* eslint-disable jsdoc/require-jsdoc */

import {
	describe,
	after,
	it      }        from 'mocha'; // eslint-disable-line node/no-unpublished-import
import {
	strictEqual,
	deepStrictEqual,
	rejects        } from 'node:assert/strict';

import { createClient } from './client.js';
import                       './server.js';

const tasqClient = await createClient();

function getRelativeDiff(ts1, ts2) {
	return Math.abs(ts1 - ts2) / Math.max(ts1, ts2);
}

describe('successfully responding to requests', () => {
	it('method returning string', async () => {
		strictEqual(
			await tasqClient.request('test', 'echo'),
			'Hello, world!',
		);
	});
	it('method returning string from argument', async () => {
		strictEqual(
			await tasqClient.request(
				'test',
				'echo',
				{
					name: 'Tasq',
				},
			),
			'Hello, Tasq!',
		);
	});
	it('method returning object', async () => {
		deepStrictEqual(
			await tasqClient.request('test', 'user'),
			{
				id: 1,
				name: 'Tasq',
			},
		);
	});
});
describe('throwing errors', () => {
	it('unknown method', async () => {
		await rejects(
			async () => {
				await tasqClient.request('test', 'not-exists');
			},
			(error) => {
				deepStrictEqual(
					error.constructor.name,
					'TasqRequestUnknownMethodError',
				);

				return true;
			},
		);
	});
	it('method that throws', async () => {
		await rejects(
			async () => {
				await tasqClient.request('test', 'error');
			},
			(error) => {
				deepStrictEqual(
					error.constructor.name,
					'TasqRequestRejectedError',
				);

				return true;
			},
		);
	});
});
describe('internal things', () => {
	it('running 2 tasks in parallel and scheduling 3rd task', async () => {
		const performance_start = performance.now();

		const result = await Promise.all(
			Array.from(
				{ length: 3 },
				() => tasqClient.request('test', 'echo')
					.then(() => performance.now() - performance_start),
			),
		);

		// console.log('result', result);

		// first 2 tasks should be executed in parallel
		strictEqual(
			getRelativeDiff(result[0], result[1]) < 0.005,
			true,
		);

		// execution of 3rd task should be delayed until one of the first 2 tasks is finished
		strictEqual(
			getRelativeDiff(result[1], result[2]) > 0.1,
			true,
		);
	});
});

after(() => {
	setTimeout(() => {
		process.exit(0); // eslint-disable-line no-process-exit, unicorn/no-process-exit
	});
});

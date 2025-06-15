import { createTasq } from '../src/main.js';
import { redisClient } from './redis.js';

const tasqClient = await createTasq(redisClient);

export const tasqServer = tasqClient.serve({
	topic: 'test',
	threads: 2,
	handlers: {
		echo(args) {
			if (Array.isArray(args)) {
				throw new TypeError('Invalid args.');
			}

			return `Hello, ${args?.name ?? 'world'}!`;
		},
		timeout() {
			return new Promise((resolve) => {
				setTimeout(
					() => resolve(undefined),
					100,
				);
			});
		},
		// eslint-disable-next-line n/no-sync
		userSync() {
			return {
				id: 1,
				name: 'Tasq',
			};
		},
		async userAsync() {
			await new Promise((resolve) => {
				setTimeout(
					resolve,
					20,
				);
			});

			return {
				id: 1,
				name: 'Tasq',
			};
		},
		async slow() {
			await new Promise((resolve) => {
				setTimeout(
					resolve,
					500, // 500 ms
				);
			});

			return 'OK';
		},
		error() {
			throw new Error('Test error.');
		},
		async randomResult(args) {
			// console.log('randomResult', args);
			if (Array.isArray(args)) {
				throw new TypeError('Invalid args.');
			}

			if (args?.expected_result === 'timeout') {
				await new Promise((resolve) => {
					setTimeout(
						resolve,
						200,
					);
				});
			}

			// await new Promise((resolve) => {
			// 	setTimeout(
			// 		resolve,
			// 		Math.random() * 50, // up to 50 ms
			// 	);
			// });

			if (args?.expected_result === 'throw') {
				throw new Error('Random error.');
			}

			if (args?.expected_result === 'reply') {
				return 'OK';
			}

			throw new TypeError('Invalid args.');
		},
	},
});


import { createClient } from './client.js';

const tasqClient = await createClient();

tasqClient.serve({
	topic: 'test',
	threads: 2,
	handlers: {
		echo({ name }) {
			return `Hello, ${name ?? 'world'}!`;
		},
		user() {
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

export default tasqClient;

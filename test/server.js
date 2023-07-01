
import { createClient } from '@kirick/redis-client';

import Tasq from '../src/main.js';

const redisClient = createClient();

const tasq_client = new Tasq(redisClient);

tasq_client.serve({
	topic: 'test',
	handler(method, args) {
		console.log(`Unknown method "${method}" received with args =`, args);
		throw new Error(`Unknown method "${method}".`);
	},
	handlers: {
		async echo({ name }) {
			console.log('Task "echo" received');

			return `Hello, ${name}!`;
		},
	},
});

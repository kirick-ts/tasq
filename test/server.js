
import Tasq from '../src/main.js';

const tasq_client = new Tasq({
	host: 'localhost',
	port: 6379,
});

tasq_client.serve({
	topic: 'test',
	handlers: {
		async echo({ name }) {
			console.log('Task "echo" received');

			return `Hello, ${name}!`;
		},
	},
});

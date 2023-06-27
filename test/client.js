
import Tasq from '../src/main.js';

const tasq_client = new Tasq({
	host: 'localhost',
	port: 6379,
});

const response = await tasq_client.request(
	'test.echo',
	{
		name: process.argv[2] ?? process.env.HOSTNAME ?? 'world',
	},
);
console.log('response =', response);

tasq_client.destroy();
process.exit(); // eslint-disable-line no-process-exit, unicorn/no-process-exit

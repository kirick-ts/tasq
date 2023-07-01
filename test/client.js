
import { createClient } from '@kirick/redis-client';

import Tasq from '../src/main.js';

const redisClient = createClient();
const tasq_client = new Tasq(redisClient);

const response = await tasq_client.request(
	'test.' + (process.argv[3] ?? 'echo'),
	{
		name: process.argv[2] ?? process.env.HOSTNAME ?? 'world',
	},
);
console.log('response =', response);

await tasq_client.destroy();
await redisClient.disconnect();

process.exit(); // eslint-disable-line no-process-exit, unicorn/no-process-exit

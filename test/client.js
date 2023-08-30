/* eslint-disable jsdoc/require-jsdoc */

import Tasq from '../src/main.js';

import { createRedisClient } from './redis.js';

export async function createClient() {
	return new Tasq(
		await createRedisClient(),
	);
}

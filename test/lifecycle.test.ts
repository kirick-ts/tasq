import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, test } from 'vitest';
import {
	getRedisChannelForRequest,
	getRedisChannelForResponse,
	getRedisKey,
} from '../src/fns.js';
import {
	createTasq,
	TasqRequestDestroyedError,
	TasqRequestTimeoutError,
	TasqServer,
} from '../src/main.js';
import { countConnections, createRedisClient } from './redis.js';
import { createGate, createTopic, sleep, waitFor } from './utils.js';

const redisClient = await createRedisClient();
const tasq = await createTasq(redisClient);

afterAll(async () => {
	await tasq.destroy();
	await redisClient.quit();
});

/**
 * Counts clients subscribed to the channel where the topic's tasks are announced.
 * @param topic The topic.
 * @returns The number of subscribers.
 */
async function countServers(topic: string): Promise<number> {
	const channel = getRedisChannelForRequest(topic);
	const subscribers = await redisClient.PUBSUB_NUMSUB(channel);

	return subscribers[channel] ?? 0;
}

/**
 * Checks that nobody takes tasks for the topic.
 * @param topic The topic.
 * @returns -
 */
async function expectNotServed(topic: string) {
	await expect(
		tasq.request(topic, 'ping', undefined, { timeout: 200 }),
	).rejects.toBeInstanceOf(TasqRequestTimeoutError);
}

describe('Tasq.destroy()', () => {
	test('destroys servers and closes own connection', async () => {
		const name = `tasq-test:${randomUUID()}`;
		const redisClientOwner = await createRedisClient(name);
		const tasqOwner = await createTasq(redisClientOwner, { namespace: name });
		const topic = createTopic();
		tasqOwner.serve({
			topic,
			handlers: {
				ping: () => 'pong',
			},
		});

		await expect(tasqOwner.request(topic, 'ping')).resolves.toBe('pong');
		// the given connection and its duplicate for subscriptions
		expect(await countConnections(redisClient, name)).toBe(2);
		expect(await countServers(topic)).toBe(1);

		await tasqOwner.destroy();

		expect(await countServers(topic)).toBe(0);
		await expect(
			redisClient.PUBSUB_CHANNELS(getRedisChannelForResponse(`${name}:*`)),
		).resolves.toStrictEqual([]);
		await waitFor(
			async () => (await countConnections(redisClient, name)) === 1,
		);
		await expectNotServed(topic);

		await redisClientOwner.quit();
	});

	test('leaves the given redisSubClient open', async () => {
		const name = `tasq-test:${randomUUID()}`;
		const name_sub = `tasq-test:${randomUUID()}`;
		const redisClientOwner = await createRedisClient(name);
		const redisSubClient = await createRedisClient(name_sub);
		const tasqOwner = await createTasq(redisClientOwner, { redisSubClient });
		const topic = createTopic();
		tasqOwner.serve({
			topic,
			handlers: {
				ping: () => 'pong',
			},
		});

		await expect(tasqOwner.request(topic, 'ping')).resolves.toBe('pong');
		// no duplicate was made: the given connection holds both subscriptions
		expect(await countConnections(redisClient, name)).toBe(1);
		const connections = await redisClient.CLIENT_LIST();
		expect(
			connections.find((connection) => connection.name === name_sub)?.sub,
		).toBe(2);

		await tasqOwner.destroy();

		expect(redisSubClient.isOpen).toBe(true);
		expect(await countServers(topic)).toBe(0);

		await redisSubClient.quit();
		await redisClientOwner.quit();
	});

	test('rejects pending requests', async () => {
		const tasqOwner = await createTasq(redisClient);
		// nobody serves this topic
		const promise = tasqOwner.request(createTopic(), 'ping', undefined, {
			timeout: 60_000,
		});

		await tasqOwner.destroy();

		await expect(promise).rejects.toBeInstanceOf(TasqRequestDestroyedError);
	});
});

describe('TasqServer.destroy()', () => {
	test('stops taking tasks and keeps the shared connection open', async () => {
		const topic = createTopic();
		const topic_other = createTopic();
		const server = tasq.serve({
			topic,
			handlers: {
				ping: () => 'pong',
			},
		});
		tasq.serve({
			topic: topic_other,
			handlers: {
				ping: () => 'pong',
			},
		});

		await expect(tasq.request(topic, 'ping')).resolves.toBe('pong');

		await server.destroy();

		expect(await countServers(topic)).toBe(0);
		await expectNotServed(topic);
		// the client and the other server use the same connection as the destroyed server
		await expect(tasq.request(topic_other, 'ping')).resolves.toBe('pong');
	});

	test('waits for running tasks and leaves waiting ones in the queue', async () => {
		const topic = createTopic();
		const gate = createGate();
		let is_started = false;
		const server = tasq.serve({
			topic,
			handlers: {
				async work() {
					is_started = true;
					await gate.promise;

					return 'done';
				},
			},
		});

		const running = tasq.request(topic, 'work');
		const waiting = expect(
			tasq.request(topic, 'work', undefined, { timeout: 300 }),
		).rejects.toBeInstanceOf(TasqRequestTimeoutError);
		await waitFor(() => is_started);

		let is_destroyed = false;
		const destroying = (async () => {
			await server.destroy();
			is_destroyed = true;
		})();

		// give destroy() a chance to finish without waiting for the running task
		await sleep(50);
		expect(is_destroyed).toBe(false);

		gate.open();
		await destroying;

		await expect(running).resolves.toBe('done');
		// the waiting task was not taken after destroy()
		expect(await redisClient.LLEN(getRedisKey(topic))).toBe(1);
		await waiting;
	});

	test('does not wait for running tasks when forced', async () => {
		const topic = createTopic();
		const gate = createGate();
		let is_started = false;
		const server = tasq.serve({
			topic,
			handlers: {
				async work() {
					is_started = true;
					await gate.promise;

					return 'done';
				},
			},
		});

		const promise = tasq.request(topic, 'work');
		await waitFor(() => is_started);

		// the task is blocked, so a destroy() that waits would never finish
		await server.destroy(true);

		gate.open();
		// the task still finishes and replies, since the connection is open
		await expect(promise).resolves.toBe('done');
	});

	test('closes own connection of a standalone server', async () => {
		const name = `tasq-test:${randomUUID()}`;
		const redisClientOwner = await createRedisClient(name);
		const topic = createTopic();
		const server = new TasqServer(redisClientOwner, {
			topic,
			handlers: {
				ping: () => 'pong',
			},
		});

		await expect(tasq.request(topic, 'ping')).resolves.toBe('pong');
		// the given connection and its duplicate for subscriptions
		expect(await countConnections(redisClient, name)).toBe(2);

		await server.destroy();

		expect(await countServers(topic)).toBe(0);
		await waitFor(
			async () => (await countConnections(redisClient, name)) === 1,
		);

		await redisClientOwner.quit();
	});
});

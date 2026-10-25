import { randomUUID } from 'node:crypto';

export interface Gate {
	promise: Promise<void>;
	open: () => void;
}

/**
 * Creates a unique topic, so tests never share a queue.
 * @returns The topic.
 */
export function createTopic(): string {
	return `test:${randomUUID()}`;
}

/**
 * Creates a promise that resolves only when the test opens it.
 * @returns The gate.
 */
export function createGate(): Gate {
	const { promise, resolve } = Promise.withResolvers<undefined>();

	return {
		promise,
		open() {
			resolve(undefined);
		},
	};
}

/**
 * Waits for the given time.
 * @param ms The time in milliseconds.
 * @returns -
 */
export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

/**
 * Waits until the condition is met.
 * @param condition The condition to check.
 * @param timeout How long to wait before failing.
 * @returns -
 */
export async function waitFor(
	condition: () => boolean | Promise<boolean>,
	timeout = 2000,
): Promise<void> {
	const ts_deadline = Date.now() + timeout;

	// oxlint-disable-next-line no-await-in-loop
	while (!(await condition())) {
		if (Date.now() > ts_deadline) {
			throw new Error('Condition was not met in time.');
		}

		// oxlint-disable-next-line no-await-in-loop
		await sleep(5);
	}
}

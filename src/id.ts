import { randomBytes } from 'node:crypto';

/**
 * Generates a random ID.
 * @returns The generated ID.
 */
export function createId(): Buffer {
	return randomBytes(6);
}

/**
 * Generates a random ID.
 * @returns The generated ID.
 */
export function createIdString(): string {
	return createId()
		.toString('base64')
		.replaceAll('=', '');
}

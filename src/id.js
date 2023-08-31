
import { randomBytes } from 'node:crypto';

/**
 * Generates a random ID.
 * @returns {Buffer} The generated ID.
 */
export default function () {
	return randomBytes(6);
}

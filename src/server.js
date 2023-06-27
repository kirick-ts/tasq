
import { getTime,
         getRedisKey,
         getRedisChannelForRequest,
         getRedisChannelForResponse } from './fns.js';

export default class TasqServer {
	#client_pub;
	#client_sub;
	#handlers;
	#redis_key;
	#processes = 0;
	#processes_max = 1;

	constructor(
		client,
		{
			topic,
			threads = 1,
			handlers,
		},
	) {
		this.#client_pub = client;
		this.#client_sub = client.duplicate();
		this.#handlers = handlers;
		this.#redis_key = getRedisKey(topic);
		this.#processes_max = threads;

		this.#client_sub.subscribe(
			getRedisChannelForRequest(topic),
			async () => {
				// console.log('New task available!\nRunning scheduler...');
				this.#schedule();
			},
		);

		this.#schedule();
	}

	#schedule() {
		this.#execute().catch((error) => {
			console.error(error);
		});
	}

	async #execute() {
		if (this.#processes >= this.#processes_max) {
			// console.log('Maximum number of processes reached.');
			return;
		}

		this.#processes++;

		const task_string = await this.#client_pub.LPOP(
			this.#redis_key,
		);
		const has_task = typeof task_string === 'string';
		if (has_task) {
			const [
				client_id,
				request_id,
				ts_timeout,
				method,
				data,
			] = JSON.parse(task_string);

			if (getTime() < ts_timeout) {
				// console.log(`Running task with method "${method}"...`);

				const response = [
					request_id,
				];

				if (typeof this.#handlers[method] !== 'function') { // eslint-disable-line unicorn/no-negated-condition
					response.push(2);
				}
				else {
					try {
						response.push(
							0,
							await this.#handlers[method](data),
						);
					}
					catch {
						response.push(1);
					}
				}

				await this.#client_pub.publish(
					getRedisChannelForResponse(client_id),
					JSON.stringify(response),
				);
			}
			// else {
			// 	console.log('Task expired.');
			// }
		}
		// else {
		// 	console.log('No more tasks to execute.');
		// }

		this.#processes--;

		if (has_task) {
			this.#schedule();
		}
	}

	destroy() {
		this.#client_sub.unsubscribe();
		// TODO: close client connections
	}
}

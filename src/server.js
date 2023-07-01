
import {
	getTime,
	getRedisKey,
	getRedisChannelForRequest,
	getRedisChannelForResponse } from './fns.js';

export default class TasqServer {
	#client_pub;
	#client_sub;
	#handler;
	#handlers;
	#redis_key;
	#processes = 0;
	#processes_max = 1;

	constructor(
		client,
		{
			topic,
			threads = 1,
			handler,
			handlers,
		},
	) {
		this.#client_pub = client;
		this.#client_sub = client.duplicate();
		this.#handler = handler;
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

				let handler;
				let handler_args;
				if (typeof this.#handlers[method] === 'function') {
					handler = this.#handlers[method];
					handler_args = [ data ];
				}
				else if (typeof this.#handler === 'function') {
					handler = this.#handler;
					handler_args = [
						method,
						data,
					];
				}

				if (handler) {
					try {
						response.push(
							0,
							await handler(...handler_args),
						);
					}
					catch {
						response.push(1);
					}
				}
				else {
					response.push(2);
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

	async destroy() {
		await this.#client_sub.unsubscribe();
		// await this.#client_sub.QUIT(); // Error: Cannot send commands in PubSub mode
		await this.#client_sub.disconnect();
	}
}

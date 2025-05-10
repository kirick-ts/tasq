# Tasq 🚀

[![NPM Version](https://img.shields.io/npm/v/@kirick/tasq.svg)](https://www.npmjs.com/package/@kirick/tasq)
[![License](https://img.shields.io/npm/l/@kirick/tasq.svg)](https://github.com/kirick-ts/tasq/blob/main/LICENSE)

Tasq is a lightweight, Redis-backed task scheduler designed for microservices. It provides a simple yet powerful way to distribute tasks across your services.

## Features

- 🔄 **Request-Response Pattern** - Simple RPC-like communication between microservices
- ⏱️ **Reliable Task Scheduling** - Built-in timeout handling with automatic cleanup of expired tasks
- 🧵 **Controlled Concurrency** - Process multiple tasks in parallel without overwhelming your services
- 🚀 **High Performance** - Optimized for low-latency communication with binary serialization using CBOR
- 💪 **Type Safety** - First-class TypeScript support with complete type definitions
- 🛡️ **Error Resilience** - Structured error handling for predictable failure scenarios

## Why Tasq?

When building distributed systems, you shouldn't have to choose between simplicity and reliability. HTTP requests lack persistence when services are down. Message brokers like RabbitMQ or Kafka add operational complexity. WebSockets don't handle request-response patterns cleanly.

Tasq leverages Redis (which you probably already use) to provide the perfect middle ground: persistent task queues with RPC-like simplicity. Tasks are stored until they can be processed, responses are routed back to requesters, and everything feels like native async/await. You get the fault tolerance of a message queue with the developer experience of a function call—all with minimal latency and operational overhead.

No new infrastructure to deploy, no complex protocols to learn, just reliable communication between your microservices.

## Installation

```bash
bun add @kirick/tasq redis
# or
pnpm add @kirick/tasq redis
# or
npm install @kirick/tasq redis
```

## Basic Usage

### Client

The code below shows how to make a request to a Tasq server. After connecting to Redis and creating a Tasq client, you simply call `request()` with the topic (service name), method, and arguments. Then, just `await` it.

```typescript
import { createClient } from 'redis';
import { createTasq } from '@kirick/tasq';

// Create and connect Redis client
const redisClient = createClient();
await redisClient.connect();

// Create Tasq client
const tasq = await createTasq(redisClient);

// Send a request and await response
try {
  const result = await tasq.request(
    'user-service',    // service you want to call
    'getUserById',     // method on the service
    { id: 123 },       // arguments for the method
    { timeout: 5000 }, // options for request
  );

  console.log('User:', result);
} catch (error) {
  console.error('Request failed:', error);
}
```

### Server

Here we're creating a Tasq server and implementing the `getUserById` method that our client is calling. When a request comes in, Tasq automatically routes it to the appropriate handler, manages concurrency with the `threads` option, and returns the result to the client that made the request.

```typescript
import { createClient } from 'redis';
import { createTasq } from '@kirick/tasq';

// Create and connect Redis client
const redisClient = createClient();
await redisClient.connect();

// Create Tasq client
const tasq = await createTasq(redisClient);

// Create a server that processes tasks for the 'user-service' topic
const server = tasq.serve({
  topic: 'user-service',
  handlers: {
    // Define handler for getUserById method
    async getUserById ({ id }) {
      // Get user from database
      const user = await db.users.findById(id);
      return user;
    },
  },
  threads: 4, // Process up to 4 tasks concurrently
});
```

The default handler acts as a catch-all for any methods that don't have specific handlers. While specific handlers directly receive the method arguments, the default handler receives both the method name and its arguments, allowing you to implement dynamic routing logic. This is useful for implementing generic APIs or when you have many similar methods that follow a pattern.

```typescript
const server = tasq.serve({
  topic: 'math-service',
  async handler (method, args) {
    // Handle all methods that don't have specific handlers
    switch (method) {
      case 'add':
        return args.a + args.b;
      case 'subtract':
        return args.a - args.b;
      default:
        throw new Error(`Unknown method: ${method}`);
    },
  },
});
```

## Error Handling

Tasq provides specific error types to handle different failure scenarios:

- `TasqRequestTimeoutError`: Request exceeded timeout
- `TasqRequestUnknownMethodError`: Method doesn't exist on the server
- `TasqRequestRejectedError`: Method execution failed on the server

```typescript
import {
  TasqRequestTimeoutError,
  TasqRequestUnknownMethodError,
  TasqRequestRejectedError
} from '@kirick/tasq';

try {
  const result = await tasq.request('topic', 'method');
} catch (error) {
  if (error instanceof TasqRequestTimeoutError) {
    console.error('Request timed out');
  } else if (error instanceof TasqRequestUnknownMethodError) {
    console.error('Method not found');
  } else if (error instanceof TasqRequestRejectedError) {
    console.error('Method execution failed');
  }
}
```

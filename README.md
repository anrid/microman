# Microman

A back-end WebSocket API framework using a microservice architecture.

### Features

- A simple set of primitives to quickly get started building a scalable back-end.

- Built using [uWebSocket](https://github.com/uNetworking/uWebSockets), [RabbitMQ](http://www.rabbitmq.com/tutorials/tutorial-one-javascript.html) and Docker.

- Uses workers to process API requests.

- Scales well. Clients connect to a cluster of socket servers that only manage connections, rate limits and broadcasting. All requests are delegated to workers via a durable worker queue.

- Supports broadcasting to a user session (user id) across the whole socket server cluster, to handle users connected on multiple devices and/or browser tabs.

- Rate limiting (throttling) of incoming API requests.

### Usage

Install all the things.
```bash
$ yarn install
```

Run docker-compose. You only need RabbitMQ so feel free to adjust the `docker-compose.yml` to suit your needs.
```bash
$ docker-compose up
```

Start the example socket server cluster (a couple of processes):

```bash
$ yarn servers

# This runs:
# $ concurrently './src/examples/api-server.js 11100' './src/examples/api-server.js 11200'
```

Start the example APi worker cluster:

```bash
$ yarn workers

# This runs:
# $ concurrently './src/examples/api-worker.js' './src/examples/api-worker.js'
```

Run the API client against to test everything:

```bash

# Simple test client.
# Runs an infinite loop of 'echo' calls with a delay of 100ms.
$ ./src/examples/api-client.js \
  --host api-dev.taskworld.com \
  --port 11100

# Multiple concurrent clients.
# Same as above but with 10 concurrent clients.
$ ./src/examples/api-client.js \
  --host api-dev.taskworld.com \
  --port 11100 \
  --clients 10

# Max throughput.
# Have 500 concurrent clients send 3 rapid 'echo's each with a delay of 500ms.
# WARNING: Do NOT do this unless you’ve set ulimit properly.
# For fellow macOS users, do this: https://blog.dekstroza.io/ulimit-shenanigans-on-osx-el-capitan/
$ ./src/examples/api-client.js \
  --host api-dev.taskworld.com \
  --port 11100 \
  --clients 500 \
  --iterations 3 \
  --delay 500

# Overload.
# Do CPU heavy work with 10 concurrent clients.

$ ./src/examples/api-client.js \
  --host api-dev.taskworld.com \
  --port 11100 \
  --clients 10 \
  --iterations 10 \
  --delay 100 \
  --topic heavy
```

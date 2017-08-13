# Microman

A back-end WebSocket API framework using a microservice architecture.

### Features

- A simple set of primitives to quickly get started building a scalable back-end.

- Built using [uWebSocket](https://github.com/uNetworking/uWebSockets), [RabbitMQ](http://www.rabbitmq.com/tutorials/tutorial-one-javascript.html) and Docker.

- Uses workers to process API requests.

- Scales well. Clients connect to a cluster of socket servers that only manage connections, broadcasting and rate limits. All requests are delegated to workers via a durable worker queue (RabbitMQ).

- Supports broadcasting to a user session (e.g. a user id) across the entire socket server cluster, to handle users connected with multiple devices or browser tabs.

- Rate limiting / throttling of incoming API requests.

### Usage

1. Install all the things.
```bash
$ git clone git@github.com:anrid/microman.git
$ cd microman
$ yarn install
```

2. Create a `.env` file in the project root (needed to run examples) and fill in as follows:
```bash
# ./microman/.env
MICRO_HOST=api-dev.taskworld.com
MICRO_CERT=/path/to/tls/cert.crt
MICRO_CERT_KEY=/path/to/tls/cert.key
MICRO_API_SECRET=some-secret-123456
MICRO_TOKEN_EXPIRES_DAYS=7
MICRO_MONGO_DB_URL=mongodb://localhost/microman_dev
```

3. Run docker-compose. You only need RabbitMQ so feel free to adjust the `docker-compose.yml` to suit your needs.
```bash
$ docker-compose up
```

4. Start the example socket server cluster:
```bash
$ yarn servers
# This runs:
# $ concurrently './examples/api-server.js 11100' './examples/api-server.js 11200'
```

5. Start the example API worker cluster:
```bash
$ yarn workers
# This runs:
# $ concurrently './examples/api-echo-worker.js' './examples/api-misc-worker.js'
```

6. Run the API client to test everything:
```bash
# Simple test client.
# Runs an infinite loop of 'echo' calls with a delay of 100ms.
$ ./examples/loadtest-client.js \
  --host api-dev.taskworld.com \
  --port 11100
#
# Multiple concurrent clients.
# Same as above but with 10 concurrent clients.
$ ./examples/loadtest-client.js \
  --host api-dev.taskworld.com \
  --port 11100 \
  --clients 10
#
# A whole bunch of clients.
# Have 500 concurrent clients send 3 rapid 'echo's each with a delay of 500ms.
# WARNING: Do NOT do this unless you’ve set ulimit properly (will force you to reboot your mac) !
# Fellow macOS users, do this: https://blog.dekstroza.io/ulimit-shenanigans-on-osx-el-capitan/
$ ./examples/loadtest-client.js \
  --host api-dev.taskworld.com \
  --port 11100 \
  --clients 500 \
  --iterations 3 \
  --delay 500
#
# Overload.
# Do CPU heavy work with 10 concurrent clients.
$ ./examples/loadtest-client.js \
  --host api-dev.taskworld.com \
  --port 11100 \
  --clients 10 \
  --iterations 10 \
  --delay 100 \
  --topic heavy
```

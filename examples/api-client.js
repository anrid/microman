#!/usr/bin/env node
/*
  Usage:

  Simple test client.
  Runs an infinite loop of 'echo' calls with a delay of 100ms.
  ./examples/api-client.js --host api-dev.taskworld.com --port 11100

  Multiple concurrent clients. Same as above but with 10 concurrent clients.
  ./examples/api-client.js --host api-dev.taskworld.com --port 11100 --clients 10

  Max throughput. Have 500 concurrent clients send 3 rapid 'echo's each with a delay of 500ms.
  ./examples/api-client.js --host api-dev.taskworld.com --port 11100 --clients 500 --iterations 3 --delay 500

  Overload. Do heavy work with 10 concurrent clients causing API throttling to kick in.
  ./examples/api-client.js --host api-dev.taskworld.com --port 11100 --clients 10 --iterations 10 --delay 100 --topic heavy
*/
'use strict'

const Assert = require('assert')
const Shortid = require('shortid')
const P = require('bluebird')
const WebSocket = require('uws')
const log = require('../src/logger')('client')
const args = require('minimist')(process.argv.slice(2))

Assert(args.host, 'Missing --host arg.')
Assert(args.port, 'Missing --port arg.')
args.clients = args.clients || 1
args.topic = args.topic || 'echo'
args.iterations = args.iterations || true
args.delay = args.delay || 100

const _global = {
  topics: { },
  messages: 0,
  ack: 0,
  errors: { }
}

run(args)

function run (opts) {
  log(`Running API client:\n` + JSON.stringify(opts, null, 2))

  const clients = []
  for (let i = 0; i < opts.clients; i++) {
    clients.push(createClient(i + 1, opts))
  }

  Promise.all(clients)
  .then(() => {
    log('Global stats:', JSON.stringify(_global, null, 2))
    log(`Ran using settings:\n` + JSON.stringify(opts, null, 2))
  })
}

function randomDelay (delay = 50) {
  return delay + Math.floor(Math.random() * delay)
}

function createClient (id, { host, port, topic, iterations, delay, clients }) {
  return new Promise(resolve => {
    const url = `wss://${host}:${port}`

    if (clients < 10) log(`[${id}] Connecting to url: ${url}`)
    const ws = new WebSocket(url)

    const send = (topic, payload = { }) => {
      return ws.send(JSON.stringify({
        topic,
        payload,
        meta: { requestId: Shortid.generate() }
      }))
    }

    const stats = {
      topics: { },
      messages: 0,
      ms: 0,
      avgMs: 0,
      ack: 0,
      errors: 0
    }

    const reconnect = () => {
      setTimeout(() => createClient(id, { host, port, topic, iterations, delay }), randomDelay(1000))
    }

    ws.on('open', async () => {
      if (clients < 10) log(`[${id}] Connected.`)

      while (iterations === true || iterations > 0) {
        send(topic)
        await P.delay(randomDelay(delay))
        if (iterations !== true) iterations--
      }

      setTimeout(() => {
        log(`[${id}] Done. Stats: ${JSON.stringify(stats)}`)
        ws.close()
      }, 3000)
    })

    ws.on('error', err => {
      log(`[${id}] Error: ${err.message}`)
      stats.errors++
      if (err.message.includes('client connection')) {
        log(`[${id}] Reconnecting ..`)
        ws.close()
        reconnect()
      }
    })

    ws.on('message', (data, flags) => {
      const message = JSON.parse(data)
      if (message.topic === 'ack') {
        stats.ack++
        _global.ack++
      } else {
        if (!stats.topics[message.topic]) stats.topics[message.topic] = 0
        stats.topics[message.topic]++
        stats.messages++
        stats.ms += message.meta.ms
        stats.avgMs = (stats.ms / stats.messages).toFixed(2)

        if (!_global.topics[message.topic]) _global.topics[message.topic] = 0
        _global.topics[message.topic]++
        _global.messages++
        if (message.topic === 'error') {
          const err = message.payload.message
          if (!_global.errors[err]) {
            _global.errors[err] = 0
          }
          _global.errors[err]++
        }
      }

      if (clients < 10 && stats.messages % 100 === 0) {
        log(`[${id}] Stats ${JSON.stringify(stats)}`)
      }
    })

    ws.on('close', (code, message) => {
      if (clients < 10) log(`[${id}] Disconnected, code=${code}.`)
      if (code !== 0) {
        reconnect()
      } else {
        resolve()
      }
    })
  })
}

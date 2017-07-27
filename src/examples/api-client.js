#!/usr/bin/env node
'use strict'

const Assert = require('assert')
Assert(process.argv[2], 'Missing host arg.')
Assert(process.argv[3], 'Missing port arg.')

const Shortid = require('shortid')
const P = require('bluebird')
const log = require('../logger')('client')
const WebSocket = require('uws')

let _messageCount = 0

run({
  host: process.argv[2],
  port: process.argv[3],
  clients: process.argv[4] || 1,
  topic: process.argv[5] || 'echo',
  iterations: process.argv[6] || 0
})

function run (opts) {
  opts.clients = opts.clients ? parseInt(opts.clients, 10) : 1
  opts.iterations = parseInt(opts.iterations, 10) || true
  opts.topic = opts.topic || 'echo'

  log(`Creating ${opts.clients} clients, topic=${opts.topic} iterations=${opts.iterations} ..`)

  for (let i = 0; i < opts.clients; i++) {
    createClient(i + 1, opts)
  }
}

function randomDelay () {
  return 1000 + Math.floor(Math.random() * 1000)
}

function createClient (id, { host, port, topic, iterations }) {
  const url = `wss://${host}:${port}`
  console.log(`[${id}] Connecting to url: ${url}`)
  const ws = new WebSocket(url)

  const send = (topic, payload = { }) => {
    return ws.send(JSON.stringify({
      topic,
      payload,
      meta: { requestId: Shortid.generate() }
    }))
  }

  ws.on('open', async () => {
    log(`[${id}] Connected.`)

    while (iterations === true || iterations > 0) {
      send(topic)
      await P.delay(randomDelay())
      if (iterations !== true) iterations--
    }

    log(`[${id}] Done, kill me !`)
  })

  ws.on('error', err => {
    log(`[${id}] Error: ${err.message}`)
    if (err.message.includes('client connection')) {
      log(`[${id}] Reconnecting ..`)
      ws.close()
      setTimeout(() => createClient(id, host, port), randomDelay())
    }
  })

  ws.on('message', (data, flags) => {
    const message = JSON.parse(data)
    log(`[${id}] Message #${++_messageCount}: topic=${message.topic} ms=${message.meta.ms} socket=${message.meta.socketId}`)
  })

  ws.on('close', (code, message) => {
    log(`[${id}] Disconnected.`)
    setTimeout(() => createClient(id, host, port), randomDelay())
  })
}

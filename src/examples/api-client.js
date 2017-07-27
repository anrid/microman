#!/usr/bin/env node
'use strict'

const Assert = require('assert')
Assert(process.argv[2], 'Missing host arg.')
Assert(process.argv[3], 'Missing port arg.')
Assert(process.argv[4], 'Missing number of clients arg.')

const P = require('bluebird')
const log = require('../logger')('client')
const WebSocket = require('uws')

let _messageCount = 0

run({
  host: process.argv[2],
  port: process.argv[3],
  clients: process.argv[4]
})

function run ({ host, port, clients }) {
  clients = parseInt(clients, 10)
  log(`Creating ${clients} clients.`)
  for (let i = 0; i < clients; i++) {
    createClient(i + 1, host, port)
  }
}

function randomDelay () {
  return 3000 + Math.floor(Math.random() * 3000)
}

function createClient (id, host, port) {
  const url = `wss://${host}:${port}`
  console.log(`[${id}] Connecting to url: ${url}`)
  const ws = new WebSocket(url)

  ws.on('open', async () => {
    log(`[${id}] Connected.`)
    while (true) {
      ws.send(JSON.stringify({ topic: 'echo', payload: { } }))
      await P.delay(randomDelay())
    }
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
    log(`[${id}] Message #${++_messageCount}: topic=${message.topic} ms=${message.meta.ms}`)
  })

  ws.on('close', (code, message) => {
    log(`[${id}] Disconnected.`)
    setTimeout(() => createClient(id, host, port), randomDelay())
  })
}

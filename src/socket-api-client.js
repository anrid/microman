'use strict'

require('dotenv').config()
const Assert = require('assert')

Assert(process.env.MM_API_HOST, 'Missing MM_API_HOST env. Server host, e.g. 0.0.0.0')
Assert(process.env.MM_API_PORT, 'Missing MM_API_PORT env. Server port, e.g. 10002')

const P = require('bluebird')
const log = require('./logger')('client')
const WebSocket = require('uws')

const url = `wss://${process.env.MM_API_HOST}:${process.env.MM_API_PORT}`
console.log('Connecting to url:', url)
const ws = new WebSocket(url)

ws.on('open', async () => {
  log('Connected.')
  while (true) {
    ws.send(JSON.stringify({ topic: 'echo', payload: { } }))
    await P.delay(1500)
  }
})

ws.on('error', err => {
  log('Error:', err)
})

ws.on('message', (data, flags) => {
  log('Message:', data)
})

ws.on('close', (code, message) => {
  log('Disconnected: code=' + code)
})

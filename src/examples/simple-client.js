#!/usr/bin/env node
'use strict'

const Assert = require('assert')
const Shortid = require('shortid')
const P = require('bluebird')
const log = require('../logger')('simple-client')
const WebSocket = require('uws')

const args = require('minimist')(process.argv.slice(2))
Assert(args.host, 'Missing --host arg.')
Assert(args.port, 'Missing --port arg.')

run(args)
.catch(err => console.error(err))

async function run (opts) {
  const client = createClient(opts)
  await client.connect()

  // Send an 'echo' and wait for an 'echo' reply.
  const resp1 = await client.send({
    topic: 'echo',
    payload: { value: 'ABC' },
    waitFor: 'echo'
  })
  Assert(resp1.payload.value === 'ABC', `Should contain payload.value === 'ABC'`)

  // Send an 'echo:slow' and expect timeout to hit.
  try {
    await client.send({
      topic: 'echo:slow',
      payload: { value: 'ABC' },
      waitFor: 'echo'
    })
    Assert.fail(`Should throw before reaching this point`)
  } catch (err) {
    Assert(err.message.includes('operation timed out'), `Should receive a timeout error`)
  }

  // Send a 'heavy' and a response.
  const resp2 = await client.send({
    topic: 'heavy',
    payload: { value: 'ABC' },
    waitFor: 'heavy'
  })
  Assert(resp2.payload.encrypted.length > 50, `Should contain a long encrypted string in payload.encrypted`)
}

function createClient ({ host, port }) {
  const c = {
    isConnecting: false,
    isConnected: false,
    id: Shortid.generate(),
    url: `wss://${host}:${port}`,
    ws: null,
    requests: { },

    send ({ topic, payload, waitFor }) {
      const requestId = Shortid.generate()

      log(`[${c.id}] send=1 topic=${topic} rid=${requestId}`)
      c.ws.send(JSON.stringify({
        topic,
        payload,
        meta: { requestId }
      }))
      c.requests[requestId]

      if (!waitFor) return P.resolve()

      return new P(resolve => {
        c.requests[requestId] = resolve
      })
      .timeout(3000)
      .finally(() => {
        log(`[${c.id}] Clearing request id ${requestId}`)
        delete c.requests[requestId]
      })
    },

    connect () {
      return new P(resolve => {
        c.ws = new WebSocket(c.url)

        log(`[${c.id}] Connecting to url: ${c.url}`)
        c.isConnecting = true
        c.isConnected = false

        c.ws.on('open', () => {
          log(`[${c.id}] Connected.`)
          c.isConnecting = false
          c.isConnected = true
          resolve()
        })

        c.ws.on('error', err => {
          log(`[${c.id}] Error: ${err.message}`)
        })

        c.ws.on('message', data => {
          const message = JSON.parse(data)
          log(`[${c.id}] recv=1 topic=${message.topic} rid=${message.meta.requestId}`)
          if (message.topic !== 'ack') {
            const resolver = c.requests[message.meta.requestId]
            if (resolver) resolver(message)
          }
        })

        c.ws.on('close', (code, message) => {
          log(`[${c.id}] Disconnected, code=${code}.`)
          c.isConnecting = false
          c.isConnected = false
        })
      })
    }
  }

  return c
}

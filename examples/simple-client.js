#!/usr/bin/env node
'use strict'

const Assert = require('assert')
const Shortid = require('shortid')
const P = require('bluebird')
const log = require('../src/logger')('simple-client')
const WebSocket = require('uws')

const args = require('minimist')(process.argv.slice(2))
Assert(args.host, 'Missing --host arg.')
Assert(args.port, 'Missing --port arg.')

run(args).catch(err => console.error(err))

async function run (opts) {
  const client = createClient(opts)
  await client.connect()

  // Send an 'echo' and expect an 'echo' reply.
  const resp1 = await client.send({
    topic: 'echo',
    payload: { value: 'ABC' },
    waitFor: 'echo'
  })
  Assert(resp1.payload.value === 'ABC', `Should contain payload.value === 'ABC'`)

  // Send a 'heavy' and expect a 'heavy' reply.
  const resp2 = await client.send({
    topic: 'heavy',
    payload: { password: 'abcd1234' },
    waitFor: 'heavy'
  })
  Assert(resp2.payload.encrypted.length > 50, `Should have a long encrypted string in payload.encrypted`)
  Assert(resp2.payload.salt.length > 10, `Should have a salt string in payload.salt`)

  // Send a 'signup' and expect a 'signup'
  const resp3 = await client.send({
    topic: 'signup',
    payload: { eemmaaiill: 'ace@base.se', password: 'abcd1234' },
    waitFor: 'signup'
  })
  Assert(resp3.payload.message.includes('"email" is required'), `Should get a validation error`)

  const resp4 = await client.send({
    topic: 'signup',
    payload: { email: 'ace@base.se', password: 'abcd1234' },
    waitFor: 'signup'
  })
  Assert(resp4.payload.user._id, `Should get a user with a new user id`)
  Assert(resp4.payload.user.email === 'ace@base.se', `Should get a user with the correct email address`)
  Assert(resp4.payload.accessToken.length > 40, `Should get an access token`)

  // Connection should have a valid session at this point.

  // Send 'todo:create' and await reply.
  const resp5 = await client.send({
    topic: 'todo:create',
    payload: { title: 'My Todo!' },
    waitFor: 'todo:create'
  })
  // console.log(resp5)
  Assert(resp5.payload.todo.title === 'My Todo!', `Should get a todo object`)
  Assert(resp5.payload.todo.userId === resp4.payload.user._id, `Should be owned by the user holding the current session`)

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

      log(`[${c.id}] [R ${requestId}] send=1 topic=${topic}`)
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
      .catch(err => {
        log(`[${c.id}] [R ${requestId}] Timeout.`)
        throw err
      })
      .finally(() => {
        log(`[${c.id}] [R ${requestId}] Clear.`)
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
          log(`[${c.id}] [R ${message.meta.requestId}] recv=1 topic=${message.topic}`)
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

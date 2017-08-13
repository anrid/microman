#!/usr/bin/env node
'use strict'

const Assert = require('assert')
const { SocketClient } = require('../src')

const args = require('minimist')(process.argv.slice(2))
Assert(args.host, 'Missing --host arg.')
Assert(args.port, 'Missing --port arg.')

run(args).catch(err => console.error(err))

async function run (opts) {
  const client = SocketClient(opts)
  await client.connect()

  // Send an 'echo' and expect an 'echo' reply.
  const resp1 = await client.send({
    topic: 'echo.get',
    payload: { value: 'ABC' },
    waitFor: 'echo.get'
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

  // Send an 'echo.slow' and expect timeout to hit.
  try {
    await client.send({
      topic: 'echo.slow',
      payload: { value: 'ABC' },
      waitFor: 'echo.slow'
    })
    Assert.fail(`Should throw before reaching this point`)
  } catch (err) {
    Assert(err.message.includes('operation timed out'), `Should receive a timeout error`)
  }
}

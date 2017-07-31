#!/usr/bin/env node
'use strict'

require('dotenv').config()
const Shortid = require('shortid')
const Helper = require('../src/worker-helper')
const Crypto = require('crypto')
const { Joi, validate } = require('./lib/joi')
const Auth = require('./lib/auth')
// const log = require('../src/logger')('worker')

run().catch(err => console.error(err))

async function run () {
  // Let’s do this.
  Helper.createReadsWorker({
    'echo:all': { handler: echoAll, requireSession: false },
    'echo': { handler: echo, requireSession: false },
    'echo:slow': { handler: echoSlow, requireSession: false },
    'heavy': { handler: heavy, requireSession: false },
    'signup': { handler: signup, requireSession: false },
    // Requires a session.
    'todo:create': { handler: todoCreate }
  })
}

// =================================================================
// 'todo:create' handler.
// =================================================================

async function todoCreate ({ message, meta, session, broadcast }) {
  // Create a new todo item.
  const schema = Joi.object().keys({
    title: Joi.string().trim().min(2).max(255).required()
  })
  const todo = validate(message.payload, schema)
  todo.userId = session.userId
  todo.created = new Date()
  // Broadcast to all sockets with the same user id as the current session.
  broadcast(session.userId, 'todo:create', { todo }, meta)
}

// =================================================================
// 'signup' handler.
// =================================================================

async function signup ({ message, meta, reply }) {
  // Sign up a new user and create a session.
  const schema = Joi.object().keys({
    email: Joi.string().lowercase().trim().email().min(2).max(128).required(),
    password: Joi.string().trim().min(8).max(128).required()
  })
  const data = validate(message.payload, schema)
  const user = {
    _id: Shortid.generate(),
    email: data.email
  }
  const session = {
    userId: user._id,
    email: user.email
  }
  const accessToken = Auth.createToken(session)
  reply('signup', { user, accessToken }, meta, session)
}

// =================================================================
// 'heavy' handler, for testing something CPU intensive.
// =================================================================

async function heavy ({ message, meta, reply }) {
  // Heavy duty !
  const secret = message.value || Crypto.randomBytes(10)
  const salt = process.env.MICRO_API_SECRET
  Crypto.pbkdf2(secret, salt, 10000, 512, 'sha512', (err, encrypted) => {
    if (err) {
      return reply('error', { message: err.message }, meta)
    }
    reply('heavy', { encrypted: encrypted.toString('hex') }, meta)
  })
}

// =================================================================
// 'echo' handler.
// =================================================================

async function echo ({ message, meta, reply }) {
  // Simple echo.
  reply('echo', message.payload, meta)
}

// =================================================================
// 'echo:slow' handler, for testing API call timeouts.
// =================================================================

async function echoSlow ({ message, meta, reply }) {
  // Echo with a delay.
  setTimeout(() => {
    reply('echo', message.payload, meta)
  }, 4000)
}

// =================================================================
// 'echo:all' handler, to test broadcasting to all connected sockets.
// =================================================================

async function echoAll ({ message, meta, broadcast }) {
  // Broadcasts echo back to everyone connected.
  // FIXME: Remove this later !
  broadcast('ALL', 'echo:all', message.payload, meta)
}

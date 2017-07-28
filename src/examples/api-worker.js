#!/usr/bin/env node
'use strict'

const Shortid = require('shortid')
const Helper = require('../worker-helper')
const Crypto = require('crypto')
const log = require('../logger')('worker')

run().catch(err => console.error(err))

async function run () {
  // Let’s do this.
  const workerId = Shortid.generate()
  const { reply, broadcast } = await Helper.getReplyFunctions(workerId)

  // Main worker loop.
  Helper.createReadsWorker(workerId, async ({ message, meta }) => {
    log(`[${workerId}] topic=${message.topic} sid=${meta.sid}`)

    switch (message.topic) {
      case 'echo:all': {
        await echoAll({ message, meta, reply: broadcast })
        break
      }

      case 'echo': {
        await echo({ message, meta, reply })
        break
      }

      case 'heavy': {
        await heavy({ message, meta, reply })
        break
      }

      default:
        log(`[worker ${workerId}] Error: unsupported topic=${message.topic}`)
    }
  })
}

async function heavy ({ message, meta, reply }) {
  // Heavy duty !
  const secret = Crypto.randomBytes(10).toString('hex')
  const salt = Crypto.randomBytes(10).toString('hex')
  Crypto.pbkdf2(secret, salt, 10000, 512, 'sha512', (err, derivedKey) => {
    if (err) {
      return reply('error', { message: err.message }, meta)
    }
    reply('heavy', { encrypted: derivedKey }, meta)
  })
}

async function echo ({ message, meta, reply }) {
  // Simple echo.
  reply(message.topic, message.payload, meta)
}

async function echoAll ({ message, meta, reply }) {
  // FIXME: Broadcasts echo back to everyone connected ! Remove this later.
  reply('ALL', message.topic, message.payload, meta)
}

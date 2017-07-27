#!/usr/bin/env node
'use strict'

const Rabbit = require('../rabbit')
const Shortid = require('shortid')
const log = require('../logger')('worker')

run().catch(err => console.error(err))

async function run () {
  const workerId = Shortid.generate()

  // Fetch the publisher.
  const publisher = await Rabbit.getPublishProducer(workerId)

  // Start consuming messages off of the reads queue.
  Rabbit.getReadsConsumer(workerId, async ({ message, meta }) => {
    log(`[worker ${workerId}] topic=${message.topic} sid=${meta.sid}`)

    switch (message.topic) {
      case 'echo:all': {
        await echoAll({ message, meta, publisher })
        break
      }

      case 'echo': {
        await echo({ message, meta, publisher })
        break
      }
    }
  })
}

async function echo ({ message, meta, publisher }) {
  publisher.produce({
    topic: 'publish',
    payload: {
      reply: {
        topic: message.topic,
        payload: { ts: Date.now() }
      }
    },
    meta
  })
}

async function echoAll ({ message, meta, publisher }) {
  publisher.produce({
    topic: 'publish',
    payload: {
      broadcast: [{
        target: 'ALL',
        topic: message.topic,
        payload: { ts: Date.now() }
      }]
    },
    meta
  })
}

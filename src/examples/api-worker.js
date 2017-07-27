#!/usr/bin/env node
'use strict'

const Rabbit = require('../rabbit')
const Shortid = require('shortid')
const log = require('../logger')('worker')

run().catch(err => console.error(err))

async function run () {
  const workerId = Shortid.generate()

  const publisher = await Rabbit.getPublishProducer(workerId)

  await Rabbit.getReadsConsumer(workerId, (content) => {
    const { message, meta } = content

    log(`[worker ${workerId}] topic=${message.topic} sid=${meta.sid}`)

    if (message.topic === 'echo') {
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
  })
}

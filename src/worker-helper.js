'use strict'

const Rabbit = require('./rabbit')

async function getReplyFunctions (workerId) {
  // Fetch the publisher.
  const publisher = await Rabbit.getPublishProducer(workerId)

  // Create reply functions.
  const reply = (topic, payload, meta) => (
    publisher.produce({
      topic: 'publish',
      payload: { reply: { topic, payload } },
      meta
    })
  )

  const broadcast = (target, topic, payload, meta) => (
    publisher.produce({
      topic: 'publish',
      payload: { broadcast: [{ target, topic, payload }] },
      meta
    })
  )

  return {
    reply,
    broadcast
  }
}

function createReadsWorker (workerId, onMessage) {
  // Start consuming messages off of the reads queue.
  return Rabbit.getReadsConsumer(workerId, onMessage)
}

module.exports = {
  getReplyFunctions,
  createReadsWorker
}

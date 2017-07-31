'use strict'

const Shortid = require('shortid')
const Rabbit = require('./rabbit')
const log = require('./logger')('worker')

async function getReplyFunctions (workerId) {
  // Fetch the publisher.
  const publisher = await Rabbit.getPublishProducer(workerId)

  // Create reply functions.
  const reply = (topic, payload, meta, session) => (
    publisher.produce({
      topic: 'publish',
      payload: { reply: { topic, payload } },
      meta,
      session
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

async function createReadsWorker (topicToHandlerMap) {
  const workerId = Shortid.generate()
  const { reply, broadcast } = await getReplyFunctions(workerId)

  // Create message handler
  async function onMessage ({ message, meta, session }) {
    try {
      // Lookup handler and execute.
      log(`[${workerId}] topic=${message.topic} sid=${meta.sid}`)

      const item = topicToHandlerMap[message.topic]
      if (!item) throw new Error(`unsupported topic '${message.topic}'`)

      // Check if a session is required.
      if (item.requireSession !== false) {
        if (!session || !session.userId || !session.email) {
          throw new Error(`topic '${message.topic}' requires a user session'`)
        }
      }
      // Call the handler.
      await item.handler({ message, meta, reply, broadcast, session })
    } catch (err) {
      const message = `[${workerId}] Error: ${err.message}`
      const shortStack = err.stack.split(`\n`).slice(1, 4).join(`\n`).trim()
      log(message)
      log('Stacktrace:', shortStack)
      reply('error', { message }, meta)
    }
  }

  // Start consuming messages off of the reads queue.
  const consumer = Rabbit.getReadsConsumer(workerId, onMessage)
  return consumer
}

module.exports = {
  getReplyFunctions,
  createReadsWorker
}

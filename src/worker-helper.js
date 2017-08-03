'use strict'

const Shortid = require('shortid')
const Rabbit = require('./rabbit')
const log = require('./logger')('worker')

function getReplyFunctions (publisher, meta) {
  // Reply to one socket.
  const reply = opts => {
    const { topic, payload, session } = opts
    publisher.produce({
      topic: 'publish',
      payload: { reply: { topic, payload } },
      meta: opts.meta ? Object.assign({ }, meta, opts.meta) : meta,
      session
    })
  }

  // Broadcast to multiple sockets.
  const broadcast = opts => {
    const { target, topic, payload } = opts
    publisher.produce({
      topic: 'publish',
      payload: { broadcast: [{ target, topic, payload }] },
      meta: opts.meta ? Object.assign({ }, meta, opts.meta) : meta
    })
  }

  return {
    reply,
    broadcast
  }
}

async function createReadsWorker (topicToHandlerMap) {
  const workerId = 'worker_' + Shortid.generate()

  // Fetch the publish producer.
  const publisher = await Rabbit.getPublishProducer(workerId)

  // Create message handler.
  async function onMessage ({ message, meta, session }) {
    // Create reply functions.
    const { reply, broadcast } = getReplyFunctions(publisher, meta)

    try {
      // Lookup handler and execute.
      log(`id=${workerId} event=message topic=${message.topic} sid=${meta.sid}`)

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
      // Handle errors.
      log(`id=${workerId} event=error msg='${err.message}'`)
      const shortStack = err.stack.split(`\n`).slice(1, 4).join(`\n`).trim()
      log('Stacktrace:', shortStack)

      reply({ topic: 'error', payload: { message: err.message } })

      // NOTE: You can rethrow the exception here to have RabbitMQ requeue
      // the message and let another worker have a go at it !
      // throw err
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

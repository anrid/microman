'use strict'

const READ_QUEUE = 'read_ops_queue'
const READ_QUEUE_OPTIONS = { durable: true, messageTtl: 1000 * 90 }

const WRITE_QUEUE = 'write_opts_queue'
const WRITE_QUEUE_OPTIONS = { durable: true }

const _stats = {
  handled: 0,
  ack: 0,
  nack: 0,
  requeue: 0,
  drop: 0
}

async function connect () {
  // Connect to RabbitMQ.
  const conn = await require('amqplib').connect('amqp://localhost')
  conn.on('close', () => console.log('[rabbit] Closing connection.'))
  conn.on('error', err => console.log('[rabbit] Error:', err))
  return conn
}

async function recreateReadQueue () {
  return recreateQueue(READ_QUEUE)
}

async function recreateQueue (queue, options) {
  const conn = await connect()
  const ch = await conn.createChannel()
  await ch.deleteQueue(queue)
  await ch.assertQueue(queue, options)
  return ch
}

async function produceReadQueueTestMessages (numOfMessages = 10, topic = 'test') {
  const conn = await connect()
  const ch = await createProducer(conn, READ_QUEUE, READ_QUEUE_OPTIONS)
  for (let i = 1; i <= numOfMessages; i++) {
    await produce(ch, READ_QUEUE, { topic, value: i })
  }
  console.log(`[rabbit] Produced ${numOfMessages} messages.`)
  setTimeout(() => conn.close(), 2500)
}

function doSomethingCpuIntensive () {
  return new Promise((resolve, reject) => {
    require('crypto').pbkdf2('secret', 'salt', 10000, 512, 'sha512', (err, derivedKey) => {
      if (err) return reject(err)

      const random = Math.floor(Math.random() * 10)
      if (random === 1) {
        return reject(new Error('Random break!'))
      }

      resolve(derivedKey.toString('hex'))
    })
  })
}

async function consumeReadQueueTestMessages (id = 1) {
  const conn = await connect()
  const ch = await createConsumer(conn, READ_QUEUE, READ_QUEUE_OPTIONS)

  const onMessage = async content => {
    if (content.topic === 'test') {
      const timer = Date.now()
      await doSomethingCpuIntensive()
      _stats.handled++
      console.log(`[rabbit] [consumer #${id}] Handled topic ${content.topic} in ${Date.now() - timer} ms (count: ${_stats.handled}).`)
    }
  }

  console.log(`[rabbit] [consumer #${id}] Consuming messages ..`)
  await consume(ch, READ_QUEUE, onMessage, id)
}

async function createProducer (conn, queue, options) {
  const ch = await conn.createChannel()
  await ch.assertQueue(queue, options)
  return ch
}

function produce (ch, queue, msg = { }) {
  const buffer = Buffer.from(JSON.stringify(msg))
  return ch.sendToQueue(queue, buffer, { persistent: true })
}

async function createConsumer (conn, queue, options) {
  const ch = await conn.createChannel()
  await ch.assertQueue(queue, options)
  await ch.prefetch(4)
  return ch
}

async function consume (ch, queue, onMessage, id) {
  return ch.consume(queue, async msg => {
    if (msg !== null) {
      try {
        const content = JSON.parse(msg.content.toString())
        console.log('[rabbit] Message content:', content)
        await onMessage(content)
        ch.ack(msg)
        _stats.ack++
        // Dump stats.
        console.log(_stats)
      } catch (err) {
        console.error(`[rabbit] [consumer ${id}] Error:`, err)
        const shouldRequeue = !msg.fields.redelivered
        if (shouldRequeue) {
          console.error(`[rabbit] [consumer ${id}] Retrying message ${msg.fields.deliveryTag} ..`)
          _stats.requeue++
        } else {
          _stats.drop++
        }
        ch.nack(msg, false, shouldRequeue)
        _stats.nack++
      }
    }
  })
}

module.exports = {
  connect,
  recreateReadQueue,
  produceReadQueueTestMessages,
  consumeReadQueueTestMessages,
  createProducer,
  createConsumer,
  produce,
  consume
}

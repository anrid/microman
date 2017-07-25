'use strict'

const READ_QUEUE = 'read_queue'
const READ_QUEUE_OPTIONS = { durable: true, messageTtl: 1000 * 90 }

let promise = Promise.resolve()
switch (process.argv[2]) {
  case 'p':
  case 'producer':
    promise = create('producer', parseInt(process.argv[3] || '10', 10))
    break

  case 'c':
  case 'consumer':
    promise = create('consumer')
    break

  case 'reset':
    promise = create('reset')
    break

  default:
    console.log('Usage: node rabbit.js [producer|consumer|reset]')
}

promise
.then(() => console.log('It’s a Done Deal.'))
.catch(err => console.error(err))

async function create (type, numOfMessages = 10) {
  const conn = await require('amqplib').connect('amqp://localhost')
  conn.on('close', () => console.log('[rabbit] Closing connection.'))
  conn.on('error', err => console.log('[rabbit] Error:', err))

  switch (type) {
    case 'reset': {
      await reset(conn, READ_QUEUE, READ_QUEUE_OPTIONS)
      break
    }

    case 'producer': {
      const ch = await producer(conn, READ_QUEUE, READ_QUEUE_OPTIONS)
      for (let i = 1; i <= numOfMessages; i++) {
        await produce(ch, READ_QUEUE, { topic: 'test', value: i })
      }
      console.log(`Produced ${numOfMessages} messages.`)
      setTimeout(() => conn.close(), 2500)
      break
    }

    case 'consumer': {
      const ch = await consumer(conn, READ_QUEUE, READ_QUEUE_OPTIONS)
      await consume(ch, READ_QUEUE)
      break
    }
  }
}

async function reset (conn, queue, options) {
  const ch = await conn.createChannel()
  await ch.deleteQueue(READ_QUEUE)
  await ch.assertQueue(queue, options)
  return ch
}

async function producer (conn, queue, options) {
  const ch = await conn.createChannel()
  await ch.assertQueue(queue, options)
  return ch
}

function produce (ch, queue, msg = { }) {
  const buffer = Buffer.from(JSON.stringify(msg))
  return ch.sendToQueue(queue, buffer, { persistent: true })
}

async function consumer (conn, queue, options) {
  const ch = await conn.createChannel()
  await ch.assertQueue(queue, options)
  await ch.prefetch(4)
  return ch
}

async function consume (ch, queue) {
  return ch.consume(queue, msg => {
    if (msg !== null) {
      const content = JSON.parse(msg.content.toString())
      console.log('message content:', content)
      ch.ack(msg)
    }
  })
}

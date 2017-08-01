'use strict'

const Amqp = require('amqplib')
const log = require('./logger')('rabbit')

const READS_QUEUE = 'reads_queue'
const PUBLISH_EXCHANGE = 'publish_exchange'

// Enable automatic retrying (requeuing) of messages who’s handlers
// throw an exception.
const AUTO_RETRY = false
let _reconnects = 0

function deleteAll () {
  connect({ }, async conn => {
    const ch = await conn.createChannel()
    await ch.deleteExchange(PUBLISH_EXCHANGE)
    await ch.deleteQueue(READS_QUEUE)
    closeWithDelay(conn)
  })
}

function createConsumerStats () {
  return {
    last: {
      row: null,
      handled: 0
    },
    metrics: {
      handled: 0,
      ack: 0,
      nack: 0,
      requeue: 0,
      drop: 0,
      time: 0
    }
  }
}

function connect (handle, onOpen) {
  handle.connection = Amqp.connect('amqp://localhost')
  .then(conn => {
    conn.on('close', err => {
      log(`id=${handle.id} event=disconnect`)
      if (err) log(`event=error msg='${err.message}'`)
      // Automatically reconnect.
      // Optionally check if the close event was caused by a non-fatal error.
      // if (!require('amqplib/lib/connection').isFatalError(err)) {
      log(`id=${handle.id} event=reconnect count=${++_reconnects}`)
      setTimeout(() => connect(handle, onOpen), 3000)
    })
    conn.on('error', err => {
      // log('Error:', err)
      log(`id=${handle.id} event=error msg='${err.message}'`)
    })
    return conn
  })
  .then(conn => {
    // Reset reconnects counts.
    log(`id=${handle.id} event=connected`)
    _reconnects = 0
    return conn
  })
  .then(onOpen)
  .catch(err => {
    // log('Error:', err)
    log(`id=${handle.id} event=error msg='${err.message}'`)
    log(`id=${handle.id} event=forceful_reconnect count=${++_reconnects}`)
    setTimeout(() => connect(handle, onOpen), 3000)
  })
}

async function produceTestReads (numOfMessages = 10, topic = 'test') {
  const producer = getReadsProducer(1)
  for (let i = 1; i <= numOfMessages; i++) {
    await producer.produce({ topic, value: i })
  }
  log(`Produced ${numOfMessages} messages.`)
  producer.close()
}

async function consumeTestReads (id = 1) {
  await getReadsConsumer(id, async content => {
    if (content.topic === 'test') {
      await doSomethingCpuIntensiveThatBreaksSometimes()
    }
  })
}

function createProducer ({ id, exchange, type, queue, options }) {
  const t = { id }

  connect(t, async conn => {
    t.ch = await conn.createChannel()
    if (exchange) {
      await t.ch.assertExchange(exchange, type, options)
    } else {
      await t.ch.assertQueue(queue, options)
    }
    return conn
  })

  t.produce = async (msg = { }, options = { persistent: true }) => {
    await t.connection
    const buffer = Buffer.from(JSON.stringify(msg))
    t.ch.publish(exchange || '', queue || '', buffer, options)
  }

  t.close = async () => {
    const conn = await t.connection
    closeWithDelay(conn)
  }

  return t
}

function createConsumer ({ id, exchange, type, queue, options, onMessage }) {
  const t = { id }

  connect(t, async conn => {
    t.ch = await conn.createChannel()
    if (exchange) {
      await t.ch.assertExchange(exchange, type, options)
      const q = await t.ch.assertQueue('', options)
      await t.ch.bindQueue(q.queue, exchange, '')
    } else {
      await t.ch.assertQueue(queue, options)
      await t.ch.prefetch(4)
    }

    // Create stats and start the stats printer.
    if (!t.interval) {
      t.stats = createConsumerStats()
      t.interval = setInterval(() => printStats(id, t.stats), 3000)
    }

    log(`id=${id} event=consuming_messages`)
    t.ch.consume(queue, async msg => {
      if (msg == null) {
        log(`id=${id} event=error msg='Got empty message'`)
        return
      }

      try {
        const timer = Date.now()
        const content = JSON.parse(msg.content.toString())
        // log(`id=${id} Consumed message:`, content)
        t.stats.metrics.handled++

        // Execute message handler then ack.
        await onMessage(content)
        t.ch.ack(msg)

        // Track stats.
        t.stats.metrics.ack++
        const totalTimeInSec = t.stats.metrics.time + ((Date.now() - timer) / 1000)
        t.stats.metrics.time = Math.round(totalTimeInSec * 1000) / 1000 // Scale to 3 decimal points.
      } catch (err) {
        // Nack the message if an exception gets through all the way to this point.
        log('Error:', err)
        log(`id=${id} event=error msg=${err.message}`)

        const shouldRequeue = AUTO_RETRY && !msg.fields.redelivered

        if (shouldRequeue) {
          log(`id=${id} event=retry_message message_id=${msg.fields.deliveryTag}`)
          t.stats.metrics.requeue++
        } else {
          log(`id=${id} event=drop_message message_id=${msg.fields.deliveryTag}`)
          t.stats.metrics.drop++
        }
        t.ch.nack(msg, false, shouldRequeue)
        t.stats.metrics.nack++
      }
    })

    return conn
  })

  return t
}

function printStats (id, stats) {
  const s = JSON.stringify(stats.metrics)
  if (s !== stats.last.row) {
    let cps = 0
    if (stats.last.ts) {
      cps = (stats.metrics.handled - stats.last.handled) / ((Date.now() - stats.last.ts) / 1000)
    }
    log(`id=${id} event=stats data='${s}' cps=${cps.toFixed(2)}`)
    stats.last.row = s
    stats.last.handled = stats.metrics.handled
    stats.last.ts = Date.now()
  }
}

function getReadsProducer (id) {
  return createProducer({
    id,
    queue: READS_QUEUE,
    options: { durable: true, messageTtl: 1000 * 30 }
  })
}

function getReadsConsumer (id, onMessage) {
  return createConsumer({
    id,
    queue: READS_QUEUE,
    options: { durable: true, messageTtl: 1000 * 30 },
    onMessage
  })
}

function getPublishProducer (id) {
  return createProducer({
    id,
    exchange: PUBLISH_EXCHANGE,
    type: 'fanout',
    options: { exclusive: true }
  })
}

function getPublishConsumer (id, onMessage) {
  return createConsumer({
    id,
    exchange: PUBLISH_EXCHANGE,
    type: 'fanout',
    options: { exclusive: true },
    onMessage
  })
}

function closeWithDelay (conn) {
  setTimeout(() => conn.close(), 2500)
}

function doSomethingCpuIntensiveThatBreaksSometimes () {
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

module.exports = {
  getReadsProducer,
  getReadsConsumer,
  getPublishProducer,
  getPublishConsumer,
  produceTestReads,
  consumeTestReads,
  deleteAll
}

'use strict'

const Amqp = require('amqplib')
const log = require('./logger')('rabbit')

const PUBLISH_EXCHANGE = 'publish_exchange'
const PUBLISH_QUEUE = 'publish_queue'
const PUBLISH_QUEUE_OPTIONS = { durable: true, messageTtl: 1000 * 90 }

const READS_QUEUE = 'reads_queue'
const READS_QUEUE_OPTIONS = { durable: true, messageTtl: 1000 * 90 }

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
      cpuTime: 0
    }
  }
}

function connect (handle, onOpen) {
  handle.connection = Amqp.connect('amqp://localhost')
  .then(conn => {
    conn.on('close', err => {
      log('Connection closed.', err || '')
      // Automatically reconnect.
      // Optionally check if the close event was caused by a non-fatal error.
      // if (!require('amqplib/lib/connection').isFatalError(err)) {
      log('Reconnecting ..')
      setTimeout(() => connect(handle, onOpen), 3000)
    })
    conn.on('error', err => log('Error:', err))
    return conn
  })
  .then(onOpen)
  .catch(err => {
    console.log('Error:', err)
    log('Reconnecting (stubbornly!) ..')
    setTimeout(() => connect(handle, onOpen), 3000)
  })
}

function recreateReadsQueue () {
  return recreateQueue(READS_QUEUE, READS_QUEUE_OPTIONS)
}

function recreateQueue (queue, options) {
  connect({ }, async conn => {
    console.log(`Recreating queue: ${queue} (options: ${JSON.stringify(options)})`)
    const ch = await conn.createChannel()
    await ch.deleteQueue(queue)
    await ch.assertQueue(queue, options)
    closeWithDelay(conn)
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
  log(`[consumer #${id}] Consuming messages ..`)
}

function createProducer (id, queue, options) {
  const t = { id }

  connect(t, async conn => {
    t.ch = await conn.createChannel()
    await t.ch.assertQueue(queue, options)
    return conn
  })

  t.produce = async (msg = { }) => {
    await t.connection
    const buffer = Buffer.from(JSON.stringify(msg))
    t.ch.sendToQueue(queue, buffer, { persistent: true })
  }

  t.close = async () => {
    const conn = await t.connection
    closeWithDelay(conn)
  }

  return t
}

function createConsumer (id, queue, options, onMessage) {
  const t = { id }

  connect(t, async conn => {
    t.ch = await conn.createChannel()
    await t.ch.assertQueue(queue, options)
    await t.ch.prefetch(4)

    // Create stats and start the stats printer.
    if (!t.interval) {
      t.stats = createConsumerStats()
      t.interval = setInterval(() => printStats(id, t.stats), 3000)
    }

    t.ch.consume(queue, async msg => {
      if (msg == null) {
        log(`[consumer #${id}] Got empty message.`)
        return
      }

      try {
        const timer = Date.now()
        const content = JSON.parse(msg.content.toString())
        log(`[consumer #${id}] Message content:`, content)
        t.stats.metrics.handled++

        // Execute message handler then ack.
        await onMessage(content)
        t.ch.ack(msg)

        // Track stats.
        t.stats.metrics.ack++
        t.stats.metrics.cpuTime = Math.round(t.stats.metrics.cpuTime + ((Date.now() - timer) / 1000))
      } catch (err) {
        log(`[consumer #${id}] Error:`, err)
        const shouldRequeue = !msg.fields.redelivered
        if (shouldRequeue) {
          log(`[consumer #${id}] Retrying message ${msg.fields.deliveryTag} ..`)
          t.stats.metrics.requeue++
        } else {
          log(`[consumer #${id}] Dropping message ${msg.fields.deliveryTag} ..`)
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
    log(`[consumer #${id}] Stats: ${s} - ${cps.toFixed(2)} cps.`)
    stats.last.row = s
    stats.last.handled = stats.metrics.handled
    stats.last.ts = Date.now()
  }
}

function getReadsProducer (id) {
  return createProducer(id, READS_QUEUE, READS_QUEUE_OPTIONS)
}

function getReadsConsumer (id, onMessage) {
  return createConsumer(id, READS_QUEUE, READS_QUEUE_OPTIONS, onMessage)
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
  recreateReadsQueue,
  getReadsProducer,
  getReadsConsumer,
  produceTestReads,
  consumeTestReads
}

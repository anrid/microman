'use strict'

const Amqp = require('amqplib')
const log = require('./logger')('rabbit')

const PUBLISH_EXCHANGE = 'publish_exchange'
const WORK_EXCHANGE = 'work_exchange'

const MESSAGE_TTL = 1000 * 30

// Enable automatic retrying / requeuing of messages when handler throw an exception.
const AUTO_RETRY = false
let _reconnects = 0

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

  t.produce = async (key, msg = { }, options = { persistent: true }) => {
    await t.connection
    const buffer = Buffer.from(JSON.stringify(msg))
    if (key) log(`id=${t.id} event=publish exchange=${exchange || ''} key=${key || ''}`)
    t.ch.publish(exchange || '', key || '', buffer, options)
  }

  t.close = async () => {
    const conn = await t.connection
    closeWithDelay(conn)
  }

  return t
}

function createExchangeConsumer (opts) {
  const { id, group, exchange, type, options, onMessage } = opts
  const t = { id }

  connect(t, async conn => {
    t.ch = await conn.createChannel()

    await t.ch.assertExchange(exchange, type, options)
    const q = await t.ch.assertQueue(group || '', options)

    let bindings = 'none'
    if (type === 'topic' && Array.isArray(opts.bindings)) {
      // If this is a topic exchange, bind our anonymous queue to
      // one or more topics (binding keys).
      // E.g. opts.bindings = ['task.*', 'project.get', 'signup']
      for (const key of opts.bindings) {
        await t.ch.bindQueue(q.queue, exchange, key)
      }
      bindings = opts.bindings.join(', ')
    } else {
      await t.ch.bindQueue(q.queue, exchange, '')
    }

    // Prefetch basically applies back-pressure.
    if (opts.prefetch) {
      await t.ch.prefetch(opts.prefetch)
    }

    // Create stats and start the stats printer.
    if (!t.interval) {
      t.stats = createConsumerStats()
      t.interval = setInterval(() => printStats(id, t.stats), 3000)
    }

    log(
      `id=${t.id} exchange=${exchange} type=${type} queue=${q.queue} ` +
      `bindings=${bindings} prefetch=${opts.prefetch || '0'} ` +
      `event=consuming_messages`
    )

    t.ch.consume(q.queue, getChannelConsumerFunction(t, onMessage))

    return conn
  })

  return t
}

function getChannelConsumerFunction (t, handler) {
  return async msg => {
    if (msg == null) {
      log(`id=${t.id} event=error msg='Got empty message'`)
      return
    }

    try {
      const timer = Date.now()
      const content = JSON.parse(msg.content.toString())
      // log(`id=${id} Consumed message:`, content)
      t.stats.metrics.handled++

      // Execute message handler.
      await handler(content)

      // Ack message.
      t.ch.ack(msg)

      // Track stats.
      t.stats.metrics.ack++
      const totalTimeInSec = t.stats.metrics.time + ((Date.now() - timer) / 1000)
      t.stats.metrics.time = Math.round(totalTimeInSec * 1000) / 1000 // Scale to 3 decimal points.
    } catch (err) {
      // Nack the message if an exception gets through all the way to this point.
      log('Error:', err)
      log(`id=${t.id} event=error msg=${err.message}`)

      const shouldRequeue = AUTO_RETRY && !msg.fields.redelivered

      if (shouldRequeue) {
        log(`id=${t.id} event=retry_message message_id=${msg.fields.deliveryTag}`)
        t.stats.metrics.requeue++
      } else {
        log(`id=${t.id} event=drop_message message_id=${msg.fields.deliveryTag}`)
        t.stats.metrics.drop++
      }

      t.ch.nack(msg, false, shouldRequeue)
      t.stats.metrics.nack++
    }
  }
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

function getPublishProducer (id) {
  return createProducer({
    id,
    exchange: PUBLISH_EXCHANGE,
    type: 'fanout',
    options: { exclusive: true }
  })
}

function getPublishConsumer (id, onMessage) {
  return createExchangeConsumer({
    id,
    exchange: PUBLISH_EXCHANGE,
    type: 'fanout',
    options: { exclusive: true },
    onMessage
  })
}

function getWorkExchangeProducer (id) {
  return createProducer({
    id,
    exchange: WORK_EXCHANGE,
    type: 'topic',
    options: { durable: true, messageTtl: MESSAGE_TTL }
  })
}

function getWorkExchangeConsumer ({ id, group, bindings, onMessage }) {
  return createExchangeConsumer({
    id,
    group,
    exchange: WORK_EXCHANGE,
    type: 'topic',
    options: { durable: true, messageTtl: MESSAGE_TTL },
    prefetch: 4,
    bindings,
    onMessage
  })
}

function closeWithDelay (conn) {
  setTimeout(() => conn.close(), 2500)
}

module.exports = {
  getPublishProducer,
  getPublishConsumer,
  getWorkExchangeProducer,
  getWorkExchangeConsumer
}

#!/usr/bin/env node
'use strict'

const Rabbit = require('./rabbit')

let promise = Promise.resolve()
switch (process.argv[2]) {
  case 'p':
  case 'produce':
    promise = Rabbit.produceReadQueueTestMessages(parseInt(process.argv[3] || '10', 10))
    break

  case 'c':
  case 'consume':
    promise = Rabbit.consumeReadQueueTestMessages(process.argv[3] || '1')
    break

  case 'recreate':
    promise = Rabbit.recreateReadQueue()
    break

  default:
    console.log(`
  Usage: node rabbit.js command [arg]

  commands:
      produce     Produce [arg] messages on read queue (defaults to 10).
      consumer    Consume messages in read queue.
      recreate    Recreates queue.

  `)
}

promise.catch(err => console.error(err))

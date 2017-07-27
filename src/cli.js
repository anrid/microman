#!/usr/bin/env node
'use strict'

const Rabbit = require('./rabbit')

switch (process.argv[2]) {
  case 'p':
  case 'produce':
    Rabbit.produceTestReads(parseInt(process.argv[3] || '10', 10))
    break

  case 'c':
  case 'consume':
    Rabbit.consumeTestReads(process.argv[3] || '1')
    break

  case 'delete-all':
    Rabbit.deleteAll()
    break

  default:
    console.log(`
  Usage: node rabbit.js command [arg]

  commands:
      produce       Produce [arg] messages on read queue (defaults to 10).
      consumer      Consume messages in read queue.
      delete-all    Deletes all exchanges and queues.
  `)
}

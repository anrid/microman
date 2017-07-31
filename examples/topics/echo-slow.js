'use strict'

async function echoSlow ({ message, meta, reply }) {
  // Echo with a delay.
  setTimeout(() => {
    reply('echo', message.payload, meta)
  }, 4000)
}

module.exports = echoSlow

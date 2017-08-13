'use strict'

async function echoSlow ({ message, reply }) {
  // Echo with a delay.
  setTimeout(() => {
    reply({ topic: 'echo.slow', payload: message.payload })
  }, 4000)
}

module.exports = echoSlow

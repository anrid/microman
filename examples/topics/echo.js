'use strict'

async function echo ({ message, reply }) {
  // Simple echo.
  reply({ topic: 'echo', payload: message.payload })
}

module.exports = echo

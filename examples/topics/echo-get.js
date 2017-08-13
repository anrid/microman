'use strict'

async function echo ({ message, reply }) {
  // Simple echo.
  reply({ topic: 'echo.get', payload: message.payload })
}

module.exports = echo

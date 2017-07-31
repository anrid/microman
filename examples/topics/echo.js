'use strict'

async function echo ({ message, meta, reply }) {
  // Simple echo.
  reply('echo', message.payload, meta)
}

module.exports = echo

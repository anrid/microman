'use strict'

async function echoAll ({ message, broadcast }) {
  // Broadcasts echo back to everyone connected.
  // FIXME: Remove this later !
  broadcast({
    target: 'ALL',
    topic: 'echo:all',
    payload: message.payload
  })
}

module.exports = echoAll

'use strict'

async function echoAll ({ message, meta, broadcast }) {
  // Broadcasts echo back to everyone connected.
  // FIXME: Remove this later !
  broadcast('ALL', 'echo:all', message.payload, meta)
}

module.exports = echoAll

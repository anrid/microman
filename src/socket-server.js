'use strict'

const Fs = require('fs')
const Https = require('https')
const Express = require('express')
const Moment = require('moment')
const WebSocketServer = require('uws').Server
const Rabbit = require('./rabbit')

const log = require('./logger')('socket')
const Throttle = require('./throttle')
const Shortid = require('shortid')

const SERVER_ID = `server_` + Shortid.generate()

function createServer (opts) {
  const app = setupExpressApp()

  log(`Loading TLS certificate: ${opts.cert}`)
  const server = Https.createServer({
    cert: Fs.readFileSync(opts.cert),
    key: Fs.readFileSync(opts.certKey)
  }, app)

  setupWebSocketServer(server)

  server.listen(opts.port, opts.host, () => {
    log(`event=connected host=${opts.host} port=${opts.port}`)
    log(`Server running on ${opts.host}:${opts.port}`)
  })
}

function setupExpressApp (port) {
  const app = Express()

  // Load connect middleware.
  const cors = require('cors')
  app.use(cors())
  app.set('port', port)
  app.options('/', cors())

  // NOTE: Use this only during Google domain verification etc.
  // app.use('/', Express.static(require('path').resolve(__dirname, 'public')))

  app.get('/', function (req, res) {
    res.end('Microman Socket API Server: ' + Moment().format())
  })

  return app
}

function setupWebSocketServer (server) {
  const wss = new WebSocketServer({ server, path: '/' })

  // Handle socket connections.
  wss.on('connection', onConnection)

  // Setup RabbitMQ producer and consumer.
  const workExchange = Rabbit.getWorkExchangeProducer(SERVER_ID)

  Rabbit.getPublishConsumer(SERVER_ID, message => {
    // Broadcast once we receive a published message.
    if (!isValidPublishMessage(message)) {
      log(`id=${SERVER_ID} event=error msg='Got invalid publish message: ${JSON.stringify(message)}'`)
      return
    }
    const { payload, meta, session } = message

    let socket
    wss.clients.forEach(x => {
      if (x.id === meta.socketId) {
        socket = x
        return
      }
    })

    if (socket) {
      // Make sure we decrease throttled messages for this socket.
      Throttle.dec(socket.id)

      // Upgrade / handshake this socket connetions if we get a session.
      if (session) {
        if (!session.userId || !session.email) {
          log(`id=${SERVER_ID} event=error msg='Got invalid session data: ${JSON.stringify(session)}'`)
        } else {
          // Upgrade this socket connection (i.e. perform a handshake) if a session object is found in reply.
          log(`id=${SERVER_ID} event=session email=${session.email} uid=${session.userId}`)
          socket.session = session
        }
      }

      if (payload.reply) {
        // Reply to single socket connected to this server.
        send(socket, payload.reply.topic, payload.reply.payload, meta)
      }
    }

    if (payload.broadcast) {
      // Broadcast to selected users connected to this server.
      broadcast(wss, payload.broadcast, meta)
    }
  })

  // Print calls / second stats.
  Throttle.printStats()

  function onConnection (socket) {
    socket.id = Shortid.generate()

    socket.on('message', onMessage)
    socket.on('close', () => {
      const sid = socket.session ? socket.session.email : 'public'
      log(`id=${SERVER_ID} event=disconnect socket=${socket.id} sid=${sid}`)
    })

    async function onMessage (json) {
      const sid = socket.session ? socket.session.email : 'public_' + Shortid.generate()

      const meta = {
        // Start timer when we receive a message.
        start: Date.now(),
        ms: 0,
        from: 'server',
        sid
      }

      try {
        const message = JSON.parse(json)

        if (typeof message !== 'object') throw new Error('Message is not an object')
        if (!message.topic) throw new Error('Message missing topic')
        if (!message.payload) throw new Error('Message missing payload')

        meta.requestId = message.meta ? message.meta.requestId : sid
        meta.socketId = socket.id
        meta.from = message.topic

        // Throttle incoming messages.
        Throttle.inc(socket.id)
        Throttle.throttle(socket.id)

        // Ack message at this point.
        ackMessage(socket, meta)

        log(`id=${SERVER_ID} event=recv topic=${message.topic} sid=${meta.sid}`)

        // Queue message for processing.
        const bindingKey = message.topic.split(':').join('.')
        await workExchange.produce(bindingKey, { message, meta, session: socket.session })

        // And we’re done.
      } catch (err) {
        log('Error:', err)
        log(`id=${SERVER_ID} event=error source='${json}'`)
        send(socket, 'error', { message: err.message }, meta)
      }
    }
  }

  return wss
}

function ackMessage (socket, meta) {
  // Ack message.
  if (meta.requestId) {
    meta.ms = Date.now() - meta.start
    socket.send(JSON.stringify({ topic: 'ack', payload: null, meta }))
  }
}

function isValidPublishMessage ({ topic, payload, meta }) {
  const isValidTopic = topic === 'publish'
  const isValidPayload = typeof payload === 'object'
  const isValidMetadata = typeof meta === 'object' && meta.socketId

  if (!isValidTopic || !isValidPayload || !isValidMetadata) return false

  if (payload.reply && typeof payload.reply === 'object') {
    if (!payload.reply.topic || !payload.reply.payload) {
      log(`id=${SERVER_ID} event=error msg='Invalid reply payload: ${JSON.stringify(payload.reply)}'`)
      payload.reply = null
    }
  }

  if (payload.broadcast && Array.isArray(payload.broadcast)) {
    if (!payload.broadcast.every(x => x.topic && x.payload)) {
      log(`id=${SERVER_ID} event=error msg='Invalid broadcast payload: ${JSON.stringify(payload.broadcast)}''`)
      payload.broadcast = null
    }
  }

  return payload.reply !== null || payload.broadcast !== null
}

function broadcast (wss, messages, meta) {
  const timer = Date.now()
  let broadcasts = 0
  meta.broadcast = true

  const messageMap = messages.reduce((acc, message) => {
    const target = message.target || 'NONE'
    if (!acc[target]) acc[target] = []
    acc[target].push(message)
    return acc
  }, { })

  wss.clients.forEach(socket => {
    const key = socket.session ? socket.session.userId : 'ALL'
    const messages = messageMap[key]
    if (messages) {
      messages.forEach(message => {
        send(socket, message.topic, message.payload, meta)
        broadcasts++
      })
    }
  })

  log(`id=${SERVER_ID} event=broadcast count=${broadcasts} ms=${Date.now() - timer}`)
}

function send (socket, topic, payload, meta) {
  if (!meta.ms && meta.start) {
    // Total time (ms) spend handling message.
    meta.ms = Date.now() - meta.start
  }

  const message = JSON.stringify({ topic, payload, meta })
  log(`id=${SERVER_ID} event=send topic=${topic} ms=${meta.ms} from=${meta.from || ''} size=${message.length} sid=${meta.sid}`)
  socket.send(message)
}

module.exports = createServer

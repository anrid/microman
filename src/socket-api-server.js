'use strict'

require('dotenv').config()
const Assert = require('assert')

Assert(process.env.MM_API_HOST, 'Missing MM_API_HOST env. Server host, e.g. 0.0.0.0')
Assert(process.env.MM_API_PORT, 'Missing MM_API_PORT env. Server port, e.g. 10002')
Assert(process.env.MM_CERT, 'Missing MM_CERT env. Path to server TLS cert')
Assert(process.env.MM_CERT_KEY, 'Missing MM_CERT env. Path to server TLS cert private key')

const Fs = require('fs')
const Https = require('https')
const Express = require('express')
const Moment = require('moment')
const WebSocketServer = require('uws').Server
const Rabbit = require('./rabbit')

const log = require('./logger')('socket')
const Throttle = require('./throttle')
const Shortid = require('shortid')

createServer()

function createServer () {
  const serverId = Shortid.generate()

  const app = setupExpressApp()

  log(`Loading TLS certificate: ${process.env.MM_CERT}`)
  const server = Https.createServer({
    cert: Fs.readFileSync(process.env.MM_CERT),
    key: Fs.readFileSync(process.env.MM_CERT_KEY)
  }, app)

  setupWebSocketServer(server, serverId)

  server.listen(process.env.MM_API_PORT, process.env.MM_API_HOST, () => {
    log(`Server running on ${process.env.MM_API_HOST}:${process.env.MM_API_PORT} ..`)
  })
}

function setupExpressApp () {
  const app = Express()

  // Load connect middleware.
  const cors = require('cors')
  app.use(cors())
  app.set('port', process.env.MM_API_PORT)
  app.options('/', cors())

  // NOTE: Use this only during Google domain verification etc.
  // app.use('/', Express.static(require('path').resolve(__dirname, 'public')))

  app.get('/', function (req, res) {
    res.end('Microman API Server: ' + Moment().format())
  })

  return app
}

function setupWebSocketServer (server, serverId) {
  const wss = new WebSocketServer({ server, path: '/' })
  wss.on('connection', onConnection)

  // Setup RabbitMQ producer and consumer.
  const reads = Rabbit.getReadsProducer(serverId)
  Rabbit.getPublishConsumer(serverId, message => {
    // Broadcast once we receive a published message.
    if (!isValidPublishMessage(message)) {
      log(`Got invalid publish message:`, message)
      return
    }

    const { payload, meta } = message
    const socket = wss.clients.find(x => x.id === meta.socketId)

    if (socket) {
      // Make sure we decrease throttled messages for this socket.
      Throttle.dec(socket.id)
    }

    if (payload.session) {
      // Upgrade this socket connection if a session object is found (perform a handshake).
      log(`ns=${payload.session.email} id=${payload.session.userId}`)
      if (socket) {
        socket.session = payload.session
      } else {
        log(`Could not find a socket with id ${meta.soc}`)
      }
    }

    if (payload.reply) {
      // Reply to single socket connected to this server.
      if (socket) {
        send(socket, payload.reply.topic, payload.reply.payload, meta)
      } else {
        log(`Could not find a socket with id ${meta.soc}`)
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

    async function onMessage (json) {
      const meta = {
        ms: Date.now(), // Start timer when we receive a message.
        sid: socket.session ? socket.session.email : 'public',
        from: 'server'
      }

      try {
        const message = JSON.parse(json)

        if (typeof message !== 'object') throw new Error('Message is not an object')
        if (!message.topic) throw new Error('Message missing topic')
        if (!message.payload) throw new Error('Message missing payload')

        meta.requestId = message.meta ? message.meta.requestId : null
        meta.socketId = socket.id
        meta.from = message.topic
        message.session = socket.session

        // Throttle incoming messages.
        Throttle.inc(socket.id)
        Throttle.throttle(socket.id)

        // Ack message at this point.
        ackMessage(socket, meta)

        log(`recv=1 topic=${message.topic} sid=${meta.sid}`)

        // Queue message for processing.
        await reads.produce(message)
        // Done.
      } catch (err) {
        log('error=', err)
        log(`errorSource=${json}`)
        send(socket, 'error', { message: err.message }, meta)
      }
    }
  }

  return wss
}

function ackMessage (socket, meta) {
  // Ack message.
  if (meta.requestId) {
    socket.send(JSON.stringify({ topic: 'ack', payload: null, meta }))
  }
}

function isValidPublishMessage ({ topic, payload }) {
  if (!topic || topic !== 'publish' || !payload || typeof payload !== 'object') return false

  if (payload.reply && typeof payload.reply === 'object') {
    if (!payload.reply.topic || !payload.reply.payload) {
      log('error=Invalid reply payload=' + JSON.stringify(payload.reply))
      payload.reply = null
    }
  }

  if (payload.broadcast && Array.isArray(payload.broadcast)) {
    if (!payload.broadcast.every(x => x.topic && x.payload)) {
      log('error=Invalid broadcast payload=' + JSON.stringify(payload.broadcast))
      payload.broadcast = null
    }
  }
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
  log(`broadcast=1 count=${broadcasts} ms=${Date.now() - timer}`)
}

function send (socket, topic, payload, meta) {
  meta.ms = Date.now() - meta.ms // Total time (ms) spend handling message.
  const message = JSON.stringify({ topic, payload, meta })
  log(`send=1 topic=${topic} ms=${meta.ms} from=${meta.from || ''} size=${message.length} sid=${meta.sid}`)
  socket.send(message)
}

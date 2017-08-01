#!/usr/bin/env node
'use strict'

const Shortid = require('shortid')
const P = require('bluebird')
const log = require('../src/logger')('simple-client')
const WebSocket = require('uws')

function SocketClient ({ host, port }) {
  const c = {
    isConnecting: false,
    isConnected: false,
    id: `client_${Shortid.generate()}`,
    url: `wss://${host}:${port}`,
    ws: null,
    requests: { },

    send ({ topic, payload, waitFor }) {
      const requestId = Shortid.generate()

      log(`id=${c.id} event=send topic=${topic} req=${requestId} `)
      c.ws.send(JSON.stringify({
        topic,
        payload,
        meta: { requestId }
      }))
      c.requests[requestId]

      if (!waitFor) return P.resolve()

      return new P(resolve => {
        c.requests[requestId] = resolve
      })
      .timeout(3000)
      .catch(err => {
        log(`id=${c.id} req=${requestId} event=timeout`)
        throw err
      })
      .finally(() => {
        log(`id=${c.id} req=${requestId} event=clear`)
        delete c.requests[requestId]
      })
    },

    connect () {
      return new P(resolve => {
        c.ws = new WebSocket(c.url)

        log(`id=${c.id} event=connecting msg='Connecting to url: ${c.url}'`)
        c.isConnecting = true
        c.isConnected = false

        c.ws.on('open', () => {
          log(`id=${c.id} event=connected`)
          c.isConnecting = false
          c.isConnected = true
          resolve()
        })

        c.ws.on('error', err => {
          log(`id=${c.id} event=error msg='${err.message}'`)
        })

        c.ws.on('message', data => {
          const message = JSON.parse(data)
          log(`id=${c.id} event=recv topic=${message.topic} req=${message.meta.requestId}`)
          if (message.topic !== 'ack') {
            const resolver = c.requests[message.meta.requestId]
            if (resolver) resolver(message)
          }
        })

        c.ws.on('close', (code, message) => {
          log(`id=${c.id} event=disconnected code=${code}`)
          c.isConnecting = false
          c.isConnected = false
        })
      })
    }
  }

  return c
}

module.exports = SocketClient

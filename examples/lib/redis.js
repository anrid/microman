'use strict'

const P = require('bluebird')
const Redis = require('redis')
const Shortid = require('shortid')
const log = require('../../logger')('redis')

P.promisifyAll(Redis.RedisClient.prototype)
P.promisifyAll(Redis.Multi.prototype)

function createClient () {
  const clientId = Shortid.generate()
  const client = Redis.createClient({
    retry_strategy: function (options) {
      if (options.error && options.error.code === 'ECONNREFUSED') {
        // End reconnecting on a specific error and flush all commands with a individual error
        return new Error(`[${clientId}] The server refused the connection`)
      }
      if (options.total_retry_time > 1000 * 60 * 60) {
        // End reconnecting after a specific timeout and flush all commands with a individual error
        return new Error(`[${clientId}] Retry time exhausted`)
      }
      if (options.times_connected > 30) {
        // End reconnecting with built in error
        return undefined
      }
      // reconnect after
      return Math.min(options.attempt * 100, 3000)
    }
  })

  client.on('ready', () => {
    // Emitted once a connection is established.
    // Commands issued before the ready event are queued, then replayed just before this event is emitted.
    log(`[${clientId}] Ready.`)
  })

  client.on('connect', () => {
    // Emitted as soon as the stream is connected to the server.
    log(`[${clientId}] Connected.`)
  })

  client.on('reconnecting', () => {
    // Emitted when trying to reconnect to the Redis server after losing the connection.
    // Listeners are passed an object containing delay (in ms) and attempt (the attempt #) attributes.
    log(`[${clientId}] Reconnecting ..`)
  })

  client.on('error', err => {
    // Emitted when encountering an error connecting to the Redis server or when any other in node_redis occurs.
    log(`[${clientId}] Error:`, err)
  })

  client.on('end', () => {
    // Emitted when an established Redis server connection has closed.
    log(`[${clientId}] Closed.`)
  })

  function get (key) {
    return client.getAsync(key)
  }

  function hget (hkey, key) {
    return client.hgetAsync(hkey, key)
  }

  function set (key, value) {
    return client.setAsync(key, value)
  }

  function setex (key, value, ttl = 0) {
    return client.setexAsync(key, ttl, value)
  }

  function findKeys (pattern, from = 0) {
    return client.scanAsync(from, 'MATCH', pattern, 'COUNT', 500)
  }

  function deleteMany (keys) {
    const m = client.multi()
    keys.forEach(x => m.del(x))
    return m.execAsync()
  }

  function hset (hkey, key, value) {
    return client.hsetAsync(hkey, key, value)
  }

  function del (key) {
    return client.delAsync(key)
  }

  return {
    client,
    get,
    hget,
    set,
    setex,
    hset,
    del,
    deleteMany,
    findKeys
  }
}

module.exports = {
  createClient
}

'use strict'

const Redis = require('./redis')
const Cache = Redis.createClient()

module.exports = Cache

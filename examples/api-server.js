#!/usr/bin/env node
'use strict'

require('dotenv').config()
const Assert = require('assert')
Assert(process.argv[2], 'Missing port arg.')

const { SocketServer } = require('../src/')

SocketServer({
  host: process.env.MICRO_HOST,
  port: process.argv[2],
  cert: process.env.MICRO_CERT,
  certKey: process.env.MICRO_CERT_KEY
})

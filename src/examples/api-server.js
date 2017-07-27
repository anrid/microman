#!/usr/bin/env node
'use strict'

const Assert = require('assert')
Assert(process.argv[2], 'Missing port arg.')

const Path = require('path')
const apiServer = require('../socket-api-server')

apiServer({
  host: 'api-dev.taskworld.com',
  port: process.argv[2],
  cert: Path.resolve(__dirname, '../../../keys/tw/cert.crt'),
  certKey: Path.resolve(__dirname, '../../../keys/tw/cert.key')
})

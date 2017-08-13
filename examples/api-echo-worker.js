#!/usr/bin/env node
'use strict'

require('dotenv').config()
const { WorkerHelper } = require('../src')

WorkerHelper.createWorker({
  bindings: [
    'echo.*'
  ],
  topics: {
    // Public.
    'echo.all': { handler: require('./topics/echo-all'), requireSession: false },
    'echo.get': { handler: require('./topics/echo-get'), requireSession: false },
    'echo.slow': { handler: require('./topics/echo-slow'), requireSession: false }
  }
})

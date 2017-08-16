#!/usr/bin/env node
'use strict'

require('dotenv').config()
const { WorkerHelper } = require('../src')

WorkerHelper.createWorker({
  group: 'all-the-things-group',
  bindings: [
    'echo.*',
    'heavy',
    'signup',
    'todo.*'
  ],
  topics: {
    // Public.
    'echo.all': { handler: require('./topics/echo-all'), requireSession: false },
    'echo.get': { handler: require('./topics/echo-get'), requireSession: false },
    'echo.slow': { handler: require('./topics/echo-slow'), requireSession: false },

    'heavy': { handler: require('./topics/heavy'), requireSession: false },

    'signup': { handler: require('./topics/signup'), requireSession: false },

    // Requires a session.
    'todo:create': { handler: require('./topics/todo-create') }
  }
})

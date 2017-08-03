#!/usr/bin/env node
'use strict'

require('dotenv').config()
const { WorkerHelper } = require('../src')

WorkerHelper.createReadsWorker({
  // Public.
  'echo:all': { handler: require('./topics/echo-all'), requireSession: false },
  'echo': { handler: require('./topics/echo'), requireSession: false },
  'echo:slow': { handler: require('./topics/echo-slow'), requireSession: false },
  'heavy': { handler: require('./topics/heavy'), requireSession: false },
  'signup': { handler: require('./topics/signup'), requireSession: false },

  // Requires a session.
  'todo:create': { handler: require('./topics/todo-create') }
})

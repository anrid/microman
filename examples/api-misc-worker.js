#!/usr/bin/env node
'use strict'

require('dotenv').config()
const { WorkerHelper } = require('../src')

WorkerHelper.createWorker({
  bindings: [
    'heavy',
    'signup',
    'todo.*'
  ],
  topics: {
    // Public.
    'heavy': { handler: require('./topics/heavy'), requireSession: false },
    'signup': { handler: require('./topics/signup'), requireSession: false },
    // Requires a session.
    'todo:create': { handler: require('./topics/todo-create') }
  }
})

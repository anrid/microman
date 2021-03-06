'use strict'

const log = require('./logger')('throttle')
const { getOneMinuteLoadAverage } = require('./cpu')

const THROTTLE_PERIOD = 1000
const THROTTLE_API_CALLS_PER_SOCKET = 5
const THROTTLE_API_CALLS_TOTAL = 250

const _stats = {
  throttle: { },
  last: {
    line: null,
    count: 0
  }
}

const t = _stats.throttle
let _interval = null

function printStats (off = false) {
  if (off && _interval) {
    clearInterval(_interval)
  } else {
    _interval = setInterval(_printStats, THROTTLE_PERIOD)
  }
}

function _printStats () {
  if (t.total) {
    const cps = t.total.count / (THROTTLE_PERIOD / 1000)
    if (cps) {
      const cpu = getOneMinuteLoadAverage()
      const line = `cps=${cps.toFixed(2)} cpu=${cpu.toFixed(2)}`
      if (_stats.last.line !== line && t.total.count !== _stats.last.count) log(line)
      _stats.last.line = line
      _stats.last.count = t.total.count
    }
  }
}

function dec (id) {
  if (t.total) {
    t.total.count--
    if (t.total.count < 0) t.total.count = 0
  }
  if (t[id]) {
    t[id].count--
    if (t[id].count < 0) t[id].count = 0
  }
}

function inc (id) {
  if (!t.total) {
    t.total = {
      count: 0,
      last: Date.now()
    }
  }
  t.total.count++

  if (!t[id]) {
    t[id] = {
      count: 0,
      last: Date.now()
    }
  }
  t[id].count++
}

function throttle (id) {
  const now = Date.now()

  if (t.total) {
    if (now - t.total.last < THROTTLE_PERIOD) {
      if (t.total.count > THROTTLE_API_CALLS_TOTAL) {
        throw new Error('API too busy')
      }
    } else {
      delete t.total
    }
  }

  if (t[id]) {
    if (now - t[id].last < THROTTLE_PERIOD) {
      if (t[id].count > THROTTLE_API_CALLS_PER_SOCKET) {
        throw new Error('API socket max calls exceeded')
      }
    } else {
      delete t[id]
    }
  }

  return true
}

module.exports = {
  throttle,
  inc,
  dec,
  printStats,
  THROTTLE_PERIOD,
  THROTTLE_API_CALLS_TOTAL,
  THROTTLE_API_CALLS_PER_SOCKET
}

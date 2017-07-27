'use strict'

const Moment = require('moment')

function logger (section) {
  return function log (...s) {
    console.log(`${Moment().format()} [${section}]`, ...s)
  }
}

module.exports = logger

'use strict'

const Moment = require('moment')

function logger (section) {
  return function log (...s) {
    console.log(`${Moment().format()} s=${section}`, ...s)
  }
}

module.exports = logger

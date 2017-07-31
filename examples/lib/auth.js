'use strict'

require('dotenv').config()
const Jwt = require('jsonwebtoken')

function createToken (data) {
  const exp = Math.floor(Date.now() / 1000) + (process.env.MICRO_TOKEN_EXPIRES_DAYS * 24 * 3600)
  return Jwt.sign({ exp, data }, process.env.MICRO_API_SECRET)
}

function checkToken (token) {
  return Jwt.verify(token, process.env.MICRO_API_SECRET)
}

module.exports = {
  createToken,
  checkToken
}

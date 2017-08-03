'use strict'

const Shortid = require('shortid')
const { Joi, validate } = require('../lib/joi')
const Auth = require('../lib/auth')

const schema = Joi.object().keys({
  email: Joi.string().lowercase().trim().email().min(2).max(128).required(),
  password: Joi.string().trim().min(8).max(128).required()
})

// Sign up a new user and create a session.
async function signup ({ message, reply }) {
  const data = validate(message.payload, schema)

  const user = {
    _id: Shortid.generate(),
    email: data.email
  }

  const session = {
    userId: user._id,
    email: user.email
  }

  const accessToken = Auth.createToken(session)

  reply({ topic: 'signup', payload: { user, accessToken }, session })
}

module.exports = signup

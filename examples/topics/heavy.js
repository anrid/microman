'use strict'

const Crypto = require('crypto')
const { Joi, validate } = require('../lib/joi')

const schema = Joi.object().keys({
  password: Joi.string().trim().min(8).max(128).required()
})

async function heavy ({ message, meta, reply }) {
  // Heavy duty !
  const data = validate(message.payload, schema)
  const salt = Crypto.randomBytes(10).toString('hex')

  const encrypted = await new Promise((resolve, reject) => {
    Crypto.pbkdf2(data.password, salt, 10000, 512, 'sha512', (err, encrypted) => {
      if (err) {
        return reject(err)
      }
      resolve(encrypted)
    })
  })

  reply('heavy', { encrypted: encrypted.toString('hex'), salt }, meta)
}

module.exports = heavy

'use strict'

const Joi = require('joi')

const validate = (payload, schema) => {
  const result = Joi.validate(payload, schema, { stripUnknown: true })
  if (result.error) {
    throw new Error(result.error)
  }
  return result.value
}

module.exports = {
  Joi,
  validate
}

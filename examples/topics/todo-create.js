'use strict'

const { Joi, validate } = require('../lib/joi')

const schema = Joi.object().keys({
  title: Joi.string().trim().min(2).max(255).required()
})

// Create a new todo item.
async function todoCreate ({ message, session, broadcast }) {
  const todo = validate(message.payload, schema)
  todo.userId = session.userId
  todo.created = new Date()
  // TODO: Save todo to database !

  // Broadcast to all sockets with the same user id as the current session.
  broadcast({ target: session.userId, topic: 'todo:create', payload: { todo } })
}

module.exports = todoCreate

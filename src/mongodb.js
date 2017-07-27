'use strict'

const UUIDv1 = require('uuid/v1')
const Shortid = require('shortid')
const MongoClient = require('mongodb').MongoClient

// const ReadPreference = require('mongodb').ReadPreference
const ObjectID = require('mongodb').ObjectID
const log = require('./logger')('mongodb')

let _db

async function connect (connectToUrl) {
  if (_db) return _db

  // mongodb://[username:password@]host1[:port1][/[database]
  const url = connectToUrl || process.env.MONGO_DB_URL
  log(`Connecting to ${url}`)
  _db = await MongoClient.connect(url)
  log(`Connected to db ${_db.s.databaseName}`)

  return _db
}

async function query (asyncFunc, args) {
  await connect()
  return asyncFunc(_db, args)
}

function close () {
  if (_db) {
    log(`Closing connection to ${_db.s.databaseName}`)
    _db.close()
  }
}

function getObjectId (str) {
  return new ObjectID(str)
}

function newId () {
  return UUIDv1()
}

function newShortId () {
  return Shortid.generate()
}

module.exports = {
  connect,
  query,
  close,
  getObjectId,
  newId,
  newShortId
}

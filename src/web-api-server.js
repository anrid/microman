'use strict'

const Assert = require('assert')
const Fs = require('fs')
const Https = require('https')
const Express = require('express')
const Moment = require('moment')
const { httpsGet } = require('./util')

module.exports = webServer

async function webServer (opts) {
  Assert(opts.cert, 'Missing cert parameter. Set to a valid SSL certificate, e.g. server.crt.')
  Assert(opts.key, 'Missing key parameter. Set to a valid SSL certificate private key, e.g. server.key.')
  Assert(opts.host, 'Missing host parameter. Set to a host that resolves to this machine and matches the SSL certificate, e.g. dev.mydomain.com.')
  Assert(opts.port, 'Missing port parameter. Set to port to listen on, e.g. 9001.')
  Assert(opts.app, 'Missing app parameter. Set to a HTTPS CDN URL of an app bootstrap (html) file.')

  const result = await httpsGet(opts.app)
  Assert(result.statusCode === 200, `Could not fetch app bootstrap at URL: ${opts.app}`)

  const app = setupExpressApp(opts, result.data)

  const server = Https.createServer({
    cert: Fs.readFileSync(opts.cert),
    key: Fs.readFileSync(opts.key)
  }, app)

  server.listen(opts.port, opts.host, () => {
    log(`Server running on https://${opts.host}:${opts.port} ..`)
  })
}

function setupExpressApp (opts, webappHtml) {
  const app = Express()

  // Load connect middleware.
  const morgan = require('morgan')
  const bodyParser = require('body-parser')
  const errorhandler = require('errorhandler')
  const cors = require('cors')

  app.set('port', opts.port || 9001)

  app.use(morgan('combined'))
  app.use(errorhandler())
  app.use(bodyParser.json())
  app.use(bodyParser.urlencoded({ extended: false }))
  app.use(cors())

  app.options('/', cors())
  app.get('/', (req, res) => res.send(webappHtml))

  return app
}

function log (...s) {
  console.log(`${Moment().format()} [Web]`, ...s)
}

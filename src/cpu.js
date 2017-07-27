'use strict'

const P = require('bluebird')
const Os = require('os')

function getCpuAndMemUsageForProcess (processPattern) {
  return new P(resolve => {
    const exec = require('child_process').exec
    exec('ps aux | grep node', (error, stdout, stderr) => {
      if (error) {
        return console.error(`exec error: ${error}`)
      }
      const lines = stdout.trim().split(/[\r\n]+/).filter(x => x.length)
      const stats = lines.reduce((acc, x) => {
        const parts = x.trim().split(/[\t\s]+/)
        if (parts.length >= 10 && x.includes(processPattern)) {
          const cpuUsage = parseFloat(parts[2])
          const memUsage = parseFloat(parts[3])
          acc.cpu += cpuUsage
          acc.mem += memUsage
        }
        return acc
      }, { cpu: 0, mem: 0 })

      resolve(stats)
    })
  })
}

function getOneMinuteLoadAverage () {
  return Os.loadavg()[0]
}

module.exports = {
  getCpuAndMemUsageForProcess,
  getOneMinuteLoadAverage
}

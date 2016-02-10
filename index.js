if(process.env.NEW_RELIC_LICENSE_KEY) require('newrelic')

var async           = require('async')
var path            = require('path')
var debug           = require('debug')('app:' + path.basename(__filename).replace('.js', ''))
var runJob          = require('./jobrunner')
var Promise         = require('promise')
var entu            = require('entulib')

console.log('\n==================== Launching pildimaag ====================\n---------- ' + new Date() + ' ----------')

function readConfiguration() {
    return new Promise(function (fulfill, reject) {
        entu.getEntity(process.env.USER, {
            entuUrl: 'https://entu.entu.ee',
            user: process.env.USER,
            key: process.env.KEY
        }).then(function(opEntity) {
            fulfill(
                opEntity.get(['properties', 'configuration'])
                    .map(function(conf) { return JSON.parse(conf.value) })
            )
        }).catch(function(err) {
            reject(err)
        })
    })
}

readConfiguration().then(startJobs)

function startJobs(jobs) {
    // debug('Jobs:', JSON.stringify(jobs, null, 4))
    async.eachLimit(jobs, 3, function iterator(job, callback) {
        debug('Starting job "' + job.name + '"')
        var entuOptions = {
            entuUrl: job.entuUrl,
            user: job.apiUser,
            key: job.apiKey,
            relaxBetweenPages: job.relaxBetween.pagesSeconds,
        }
        runJob(job, entuOptions)
        .then(callback)
    },
    function(err) {
        if (err) {
            debug('Pildimaag stopped with error.', err)
            throw err
        }
        debug('All jobs launched.', JSON.stringify(jobs.map(function(a) { return a.name })))
    })
}

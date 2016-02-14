if(process.env.NEW_RELIC_LICENSE_KEY) require('newrelic')

var async           = require('async')
var path            = require('path')
var debug           = require('debug')('app:' + path.basename(__filename).replace('.js', ''))
var runJob          = require('./jobrunner')
var RSVP            = require('rsvp')
var entu            = require('entulib')
var jsonlint        = require("jsonlint")


console.log('\n==================== Launching pildimaag ====================\n---------- ' + new Date() + ' ----------')

function readConfiguration() {
    return new RSVP.Promise(function (fulfill, reject) {
        entu.getEntity(process.env.USER, {
            entuUrl: 'https://entu.entu.ee',
            user: process.env.USER,
            key: process.env.KEY
        }).then(function(opEntity) {
            debug('Got configurations')
            fulfill(
                opEntity.get(['properties', 'configuration'], []).map(function(conf) {
                    debug('Try to parse conf')
                    return jsonlint.parse(conf.value)
                })
            )
        }).catch(function(reason) {
            if (reason.code === 'ETIMEDOUT' || reason.code === 'ENOTFOUND') {
                debug('Trouble with connecting to Entu', JSON.stringify(reason))
                setTimeout(function () {
                    return init()
                }, 10e3)
            } else {
                console.log('Reason', reason)
                setTimeout(function () {
                    return init()
                }, 10e3)
            }
        })

    })
}

function init() {
    readConfiguration()
    .then(startJobs)
    .catch(function(reason) {
        debug('Crashed with good reason', reason, JSON.stringify(reason))
    })
}
init()

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

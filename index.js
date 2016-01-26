if(process.env.NEW_RELIC_LICENSE_KEY) require('newrelic')

var async           = require('async')
var path            = require('path')
var debug           = require('debug')('app:' + path.basename(__filename).replace('.js', ''))
var runTask         = require('./taskrunner')
var Promise         = require('promise')
var entu            = require('entulib')


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
    async.each(jobs, function iterator(job, callback) {
        debug('Starting job "' + job.name + '"')
        var entuOptions = {
            entuUrl: job.entuUrl,
            user: job.apiUser,
            key: job.apiKey,
            relaxBetweenPages: job.relaxBetween.pagesSeconds,
        }
        async.forever(function(next) {
            debug('=== tick forever ' + job.name + '===')
            async.eachSeries(job.tasks, function iterator(task, callback) {
                debug(job.name + ' starting task "' + task.name + '"')
                runTask(task, entuOptions)
                .then(function(result) {
                    debug(job.name, result)
                    setTimeout(callback, job.relaxBetween.tasksSeconds * 1e3)
                })
            },
            function(err) {
                if (err) { return callback(err) }
                setTimeout(next, job.relaxBetween.roundtripMinutes * 60e3)
            }
        )},
        function(err) {
            if (err) { return callback(err) }
        })
    },
    function(err) {
        if (err) {
            debug('Pildimaag stopped.')
            throw err
        }
    })
}

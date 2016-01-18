if(process.env.NEW_RELIC_LICENSE_KEY) require('newrelic')

var async           = require('async')
var runTask         = require('./taskrunner')

async.each(require('./jobs.json'), function iterator(job, callback) {
    console.log('Starting job "' + job.name + '"')
    var entuOptions = {
        entuUrl: job.entuUrl,
        user: job.apiUser,
        key: job.apiKey,
    }
    async.forever(function(next) {
        async.eachSeries(job.tasks, function iterator(task, callback) {
            console.log(job.name, 'Starting task: "' + task.name + '"')
            runTask(task, entuOptions)
            .then(function(result) {
                console.log(job.name, result)
                callback()
            })
        },
        function(err) {
            if (err) { return callback(err) }
            setTimeout(next, job.sleepMinutes * 60e3)
        }
    )},
    function(err) {
        if (err) { return callback(err) }
    })
},
function(err) {
    if (err) {
        console.log('Pildimaag stopped.')
        throw err
    }
})

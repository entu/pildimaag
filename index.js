if(process.env.NEW_RELIC_LICENSE_KEY) require('newrelic')

var async           = require('async')
var runTask         = require('./taskrunner')

async.each(require('./jobs.json'), function iterator(job, callback) {
    console.log('Starting job "' + job.name + '"')
    async.forever(function(next) {
        async.eachSeries(job.tasks, function iterator(task, callback) {
            console.log('Starting task "' + task.name + '"')
            runTask(task)
            .then(function(result) {
                console.log(result)
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

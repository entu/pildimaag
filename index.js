if(process.env.NEW_RELIC_LICENSE_KEY) require('newrelic')

var fs              = require('fs')
var path            = require('path')
var async           = require('async')


async.forever(
    function(next) {
        async.each(require('./jobs.json'), function iterator(job, callback) {
            console.log(job.name)
        }, setTimeout(next, 1e3))
    },
    function(err) {
        if (err) {
            console.log('Pildimaag stopped.')
            throw err
        }
    }
)

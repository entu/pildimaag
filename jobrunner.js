var fs              = require('fs')
var path            = require('path')
var debug           = require('debug')('app:' + path.basename(__filename).replace('.js', ''))
var async           = require('async')
var op              = require('object-path')
var Promise         = require('promise')
var entu            = require('entulib')
var gm              = require('gm')
// var Promise  = require('promise/lib/rejection-tracking').enable( {allRejections: true} )

var jobQueue        = require('./asyncQ.js')

TS_DIR = __dirname + '/timestamps'
if (!fs.existsSync(TS_DIR)) { fs.mkdirSync(TS_DIR) }


function runJob(job, entuOptions) {
    function updateTs(ts) {
        return
        entuOptions.timestamp = ts
        fs.writeFileSync(jobFilename, ts)
        // debug('Update TS: ' + jobFilename, new Date(ts * 1e3))
    }

    var jobFilename = path.join(TS_DIR, job.entuUrl.split('//')[1])
    if (!fs.existsSync(jobFilename)) { fs.writeFileSync(jobFilename, '0') }

    // debug('Task: ', JSON.stringify({task:task, entuOptions:entuOptions}, null, 4))
    return new Promise(function (fulfill, reject) {
        // debug('jobFilename: ' + jobFilename)
        async.forever(function(next) {
            entuOptions.timestamp = Number(fs.readFileSync(jobFilename, 'utf8'))
            entuOptions.limit = 2
            debug('=== tick forever ' + job.name + ' from ts:' + new Date(entuOptions.timestamp * 1e3) + ' ===')
            entu.pollUpdates(entuOptions)
            .then(function(result) {
                var skipChanged = 0
                var skipDefinition = 0
                debug(job.name + ' got ' + result.count + ' updates.')
                result.updates.sort(function(a,b) { return a.timestamp - b.timestamp })
                result.updates.forEach(function(item) {
                    if (item.action !== 'changed at') {
                        // debug(job.name, 'Skipping ' + JSON.stringify(item), '- is not a "changed" event.')
                        skipChanged ++
                        updateTs(item.timestamp)
                        return
                    }
                    op.get(job, ['tasks'], []).forEach(function(task) {
                        if (op.get(task, ['source', 'definitions'], []).indexOf(item.definition) === -1) {
                            // debug(job.name, 'Skipping' + JSON.stringify(item), 'does not match with source definition ', task.source.definitions)
                            skipDefinition ++
                            updateTs(item.timestamp)
                        } else {
                            debug(job.name, 'Processing ' + JSON.stringify(item))
                            jobQueue.push({job:job, item:item, entuOptions}, function(err) {
                                if(err) {
                                    debug(err)
                                    throw err
                                }
                                debug(job.name, 'Processed ' + JSON.stringify(item))
                                updateTs(item.timestamp)
                            })
                        }
                    })
                })
                debug(job.name + ' skipped(c/d): ' + (skipChanged + skipDefinition) + '(' + skipChanged + '/' + skipDefinition + ')')
            })
            .then(function() {
                debug(job.name + ' Relaxing for ' + job.relaxBetween.roundtripMinutes + ' minutes.')
                setTimeout(next, job.relaxBetween.roundtripMinutes * 2e3)
            })
        },
        function(err) {
            if (err) { reject(err) }
        })

    })
}


module.exports = runJob

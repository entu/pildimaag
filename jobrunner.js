var fs              = require('fs')
var path            = require('path')
var debug           = require('debug')('app:' + path.basename(__filename).replace('.js', ''))
var async           = require('async')
var op              = require('object-path')
var RSVP            = require('rsvp')
var entu            = require('entulib')

var jobQueue        = require('./asyncQ.js')

TS_DIR = __dirname + '/timestamps'
if (!fs.existsSync(TS_DIR)) { fs.mkdirSync(TS_DIR) }

var jobIncrement = 0

function runJob(job, entuOptions) {
    function updateTs(ts) {
        if (entuOptions.timestamp < ts) {
            entuOptions.timestamp = ts + 0.5
            fs.writeFileSync(jobFilename, ts + 0.5)
        }
    }

    var jobFilename = path.join(TS_DIR, job.entuUrl.split('//')[1])
    if (!fs.existsSync(jobFilename)) { fs.writeFileSync(jobFilename, '1') }

    // debug('Task: ', JSON.stringify({task:task, entuOptions:entuOptions}, null, 4))
    return new RSVP.Promise(function (fulfill, reject) {
        // debug('jobFilename: ' + jobFilename)
        async.forever(function(next) {
            entuOptions.timestamp = Number(fs.readFileSync(jobFilename, 'utf8'))
            entuOptions.limit = job.pageSize
            debug('=== tick forever ' + job.name + ' from ts:' + new Date(entuOptions.timestamp * 1e3) + ' ===')
            entu.pollUpdates(entuOptions)
            .then(function(result) {
                var skipChanged = 0
                var skipDefinition = 0
                // debug(job.name + ' got ' + result.count + ' updates.')
                result.updates.sort(function(a,b) { return a.timestamp - b.timestamp })
                // debug('----- sorted ' + JSON.stringify(result.updates))
                result.updates.forEach(function(item) {
                    updateTs(item.timestamp)
                    if (item.action !== 'changed at') {
                        skipChanged ++
                        return
                    }
                    // If task exists for given definition
                    else if ( op.get(job, ['tasks'], [])
                        .reduce(function(_defs, a) { return _defs.concat(op.get(a, ['source', 'definitions'], [])) }, [])
                        .some(function(_def) { return _def === item.definition })
                    ) {
                        jobIncrement = jobIncrement + 1
                        ;(function(jobIncrement, job, item) {
                            debug('<X + #' + jobIncrement + '/' + (jobQueue.length() + 1) + '> Enqueue ' + job.name + ' ' + JSON.stringify(item) + ' ' + new Date(item.timestamp*1e3))
                            jobQueue.push({ jobIncrement:jobIncrement, job:job, item:item, entuOptions }, function(err) {
                                if (err) {
                                    debug('<X - #' + jobIncrement + '/' + (jobQueue.length() + 1) + '> Errored ' + job.name + ' ' + JSON.stringify(item) + ' ' + new Date(item.timestamp*1e3))
                                    return reject(err)
                                }
                                debug('<X - #' + jobIncrement + '/' + (jobQueue.length() + 1) + '> Processed ' + job.name + ' ' + JSON.stringify(item) + ' ' + new Date(item.timestamp*1e3))
                            })
                        })(jobIncrement, job, item)
                        return
                    }
                    else {
                        skipDefinition ++
                        return
                    }
                })
                // debug(job.name + ' skipped(c/d): ' + (skipChanged + skipDefinition) + '(' + skipChanged + '/' + skipDefinition + ')')
            })
            .then(function() {
                // debug(job.name + ' Relaxing for ' + job.relaxBetween.roundtripMinutes + ' minutes.')
                setTimeout(next, job.relaxBetween.roundtripMinutes * 6e3)
            })
            .catch(function(reason) {
                debug('Job ' + job.name + ' stumbled.', reason, 'Relaxing for ' + job.relaxBetween.roundtripMinutes + ' minutes.')
                setTimeout(next, job.relaxBetween.roundtripMinutes * 6e3)
            })

        },
        function(err) {
            if (err) { return reject(err) }
        })

    })
}


module.exports = runJob

var fs              = require('fs')
var path            = require('path')
var debug           = require('debug')('app:' + path.basename(__filename).replace('.js', ''))
var async           = require('async')
var op              = require('object-path')
var Promise         = require('promise')
var entu            = require('entulib')
var gm              = require('gm')

var CPU_COUNT = 4

var NO_TASKS = 'no tasks'
function downloadTask(updateTask, callback) {
    debug('Performing download update: ' + JSON.stringify(updateTask.item))
    entu.getEntity(updateTask.item.id, updateTask.entuOptions)
    .then(function(opEntity) {
        // var NO_SOURCE = 'no source(s)'
        var returnTasks = op.get(updateTask.job, ['tasks'], []).map(function(a) {
            // debug(', a.source.property', a.source.property, JSON.stringify(opEntity.get(['properties', a.source.property], 'N/A'), null, 4))
            var source = opEntity.get(['properties', a.source.property], [])
            if (!Array.isArray(source)) { source = [source] }
            // if (source.length === 0) { return NO_SOURCE }
            var target = a.targets.map(function(b) {
                return {
                    template: b,
                    current: opEntity.get(['properties', b.property], [])
                }
            })
            return {
                name: a.name,
                source: source,
                target: target
            }
        })
        // debug('returnTasks', JSON.stringify(returnTasks, null, 4))
        // returnTasks = returnTasks.filter(function(a) { return a !== NO_SOURCE })
        // if (returnTasks.length === 0) { return callback(NO_TASKS) }
        callback(null, returnTasks)
    })
    .catch(function(reason) {
        debug('reason', reason)
    })
}
function prepareTask(results, callback) {
    // debug('Preparing tasks: ' + JSON.stringify(results, null, 4))
    callback(null)
}



var updateQueue = async.queue( function (updateTask, callback) {
    debug('Adding new update to job "' + updateTask.job.name + '" queue: ' + JSON.stringify(updateTask.item))
    async.auto({
        preFill: function(callback) {
            downloadTask(updateTask, callback)
        },
        prepare: ['preFill', function(callback, results) {
            prepareTask(results, callback)
        }],
        // upload: ['render', function(callback, results) {
        //     uploadTask(results, callback)
        // }]
    }, function(err, results) {
        if (err) {
            return debug('Adding new update to job "' + updateTask.job.name + '" queue: ' + JSON.stringify(updateTask.item), JSON.stringify(err))
        }
        var hasCurrentTargets = op.get(results, ['preFill'], []).some(function(a) {
            return a.target.some(function(b) {
                return b.current.length > 0
            })
        })
        if (hasCurrentTargets) {
            debug('Got tasks for job "' + updateTask.job.name + '" queue: ' + JSON.stringify(updateTask.item), JSON.stringify(results, null, 4))
        }
    })
    callback()
}, CPU_COUNT)
updateQueue.drain = function() {
    debug('updateQueue: all items have been processed')
}





var uploadQueue = async.queue( function (task, callback) {
    callback()
})
uploadQueue.drain = function() {
    debug('uploadQueue: all items have been processed')
}



module.exports = updateQueue

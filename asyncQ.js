var fs              = require('fs')
var path            = require('path')
var debug           = require('debug')('app:' + path.basename(__filename).replace('.js', ''))
var async           = require('async')
var op              = require('object-path')
var Promise         = require('promise')
var entu            = require('entulib')
var gm              = require('gm')

var CPU_COUNT = 4

var NO_TASKS = 'No changes required.'

// Generate structure like in ./returnTasksExample.json
function prepareTasks(updateTask, results, callback) {
    function targetFilename(sourceFilename, template) {
        var sourceExtName = path.extname(sourceFilename)
        var sourceFilename = path.basename(sourceFilename, sourceExtName)
        return template.fileNamePrefix + sourceFilename + template.fileNameSuffix + sourceExtName
    }
    debug('Performing download update: ' + JSON.stringify(updateTask.item))
    entu.getEntity(updateTask.item.id, results.entuOptions)
    .then(function(opEntity) {
        var returnTasks = op.get(updateTask.job, ['tasks'], []).map(function(a) {
            var returnTask = {
                jobName: a.name,
                sources: [],
                targets: []
            }
            returnTask.sources = opEntity.get(['properties', a.source.property], [])
            returnTask.targets = a.targets.map(function(b) {
                b.toCreate = returnTask.sources.map(function(c) { return targetFilename(c.value, b) })
                b.toRemove = []
                b.toKeep = opEntity.get(['properties', b.property], []).filter(function(c) {
                    if (b.toCreate.indexOf(c.value) > -1) {
                        b.toCreate.splice(b.toCreate.indexOf(c.value), 1)
                        return true
                    } else {
                        b.toRemove.push(c)
                        return false
                    }
                })
                return b
            })
            return returnTask
        })
        callback(null, {entityId: updateTask.item.id, tasks: returnTasks})
    })
    .catch(function(reason) {
        debug('reason', reason)
    })
}

function createMissing(results, callback) {
    // debug('Preparing tasks: ' + JSON.stringify(results, null, 4))
    callback(null)
}

function removeExtra(results, callback) {
    // debug('Preparing tasks: ' + JSON.stringify(results, null, 4))
    callback(null)
}



var updateQueue = async.queue( function (updateTask, callback) {
    debug('Adding new update to job "' + updateTask.job.name + '" queue: ' + JSON.stringify(updateTask.item))
    async.auto({
        entuOptions: function(callback) {
            callback(null, updateTask.entuOptions)
        },
        prepareTasks: ['entuOptions', function(callback, results) {
            prepareTasks(updateTask, results, callback)
        }],
        createMissing: ['prepareTasks', function(callback, results) {
            // debug('results', JSON.stringify(results, null, 4))
            createMissing(results, callback)
        }],
        removeExtra: ['prepareTasks', function(callback, results) {
            // debug('results', JSON.stringify(results, null, 4))
            removeExtra(results, callback)
        }],
    }, function(err, results) {
        if (err) {
            return debug('Adding new update to job "' + updateTask.job.name + '" queue: ' + JSON.stringify(updateTask.item), JSON.stringify(err))
        }
        debug('Got tasks for job "' + updateTask.job.name + '" queue: ' + JSON.stringify(updateTask.item), JSON.stringify(results, null, 4))
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

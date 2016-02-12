var fs              = require('fs')
var path            = require('path')
var debug           = require('debug')('app:' + path.basename(__filename).replace('.js', ''))
var async           = require('async')
var op              = require('object-path')
var Promise         = require('promise')
var entu            = require('entulib')
var passThrough     = require('stream').PassThrough

// var pmTransform     = require('./pmTransform.js')

var CPU_COUNT = 4

var NO_TASKS = 'No changes required.'

// Generate structure like in ./returnTasksExample.json
function prepareTasks(updateTask, results, callback) {
    function targetFilename(sourceFilename, template) {
        var sourceExtName = path.extname(sourceFilename)
        var sourceFilename = sourceFilename.substr(0, sourceFilename.length - sourceExtName.length)
        var targetFilename = template.fileNamePrefix + sourceFilename + template.fileNameSuffix + sourceExtName
        // debug('targetFilename', updateTask.item.id, targetFilename)
        return targetFilename
    }
    // debug('1:', JSON.stringify(updateTask))
    entu.getEntity(updateTask.item.id, results.entuOptions)
    .then(function(opEntity) {
        var returnTasks = op.get(updateTask.job, ['tasks'], []).map(function(_task) { // For every task
            var returnTask = {
                jobName: _task.name,
                toCreate: [],
                toRemove: []
            }
            if (op.get(_task,['source', 'definitions'], []).indexOf(op.get(updateTask, ['item', 'definition'])) === -1) {
                return returnTask
            }
            // debug('1:', JSON.stringify(updateTask.job))
            _task.targets.forEach(function(_template) { // For every template
                // debug('1.1:', JSON.stringify(_template))
                var existingFiles = opEntity.get(['properties', _template.property], [])
                // debug('1.2:', JSON.stringify(existingFiles))
                    // NOTE forceKeepInSync indicates, if we want to remove files created by others
                    existingFiles = existingFiles.filter(function(a) {
                        if (_template.forceKeepInSync === true) { return true }
                        return Number(results.entuOptions.user) === Number(a.created_by)
                    })

                returnTask.toRemove = returnTask.toRemove.concat(existingFiles)
                // debug('1.3:', JSON.stringify(opEntity.get(['properties', _template.property], []), null, 2))
            })
            // debug('2:', JSON.stringify(returnTask))

            opEntity.get(['properties', _task.source.property], []).forEach(function(_toCreate) { // For every source file
                var toCreate = {
                    value: _toCreate.value,
                    id: _toCreate.id,
                    file: _toCreate.file,
                    targets: []
                }
                _task.targets.forEach(function(_template) { // For every template
                    var target = {
                        fileName: targetFilename(_toCreate.value, _template),
                        property: _template.property,
                        format: _template.format,
                        fixWidth: _template.fixWidth,
                        fixHeight: _template.fixHeight,
                        crop: _template.crop,
                    }

                    returnTask.toRemove = returnTask.toRemove.filter(function(a){
                        if (a.value === target.fileName) {
                            return false
                        } else {
                            if (toCreate.targets.map(function(a) { return JSON.stringify(a) }).indexOf(JSON.stringify(target)) === -1) {
                                toCreate.targets.push(target)
                            }
                            return true
                        }
                    })
                })
                returnTask.toCreate.push(toCreate)
            })
            // debug('3:', JSON.stringify(returnTask))
            return returnTask
        })
        callback(null, {entityId: updateTask.item.id, tasks: returnTasks})
    })
    .catch(function(reason) {
        if (reason.code === 'ETIMEDOUT' || reason.code === 'ENOTFOUND') {
            debug('reason 1', JSON.stringify(reason))
            setTimeout(function () {
                prepareTasks(updateTask, results, callback)
            }, 10e3)
        } else if (reason.code === 'ECONNRESET') {
            debug('reason 2', JSON.stringify(reason))
            setTimeout(function () {
                prepareTasks(updateTask, results, callback)
            }, 10e3)
        } else {
            debug('reason 3', JSON.stringify(reason))
            setTimeout(function () {
                prepareTasks(updateTask, results, callback)
            }, 10e3)
        }
    })
}

function createMissing(results, callback) {
    if (op.get(results, ['prepareTasks', 'tasks'], []).reduce(function(sum, a) {
        return sum + op.get(a, ['toCreate'], []).reduce(function(sum, b) {
            return sum + op.get(b, ['targets'], []).length
        }, 0)
    }, 0) === 0) { return callback(null) }

    debug('\n==== Download source')

    var outStreams = []
    var sources = results.prepareTasks.tasks.reduce(function(arr, a) {
        return arr.concat(a.toCreate)
    }, [])
    async.each(sources, function iterator(source, callback) {
        debug('Process source', JSON.stringify(source))
        var sourceStream = entu.requestFile(source.file, results.entuOptions)
            .on('response', function(response) {
                  debug('response', response.statusCode) // 200
                  debug('response', response.headers['content-type']) // 'image/png'
            })
            .on('error', function(err) {
                console.log('error', JSON.stringify(err))
            })

        // var outStreams = [
        //     { name:'[a-str]', pass: new passThrough },
        //     { name:'[b-str]', pass: new passThrough },
        //     { name:'[c-str]', pass: new passThrough },
        // ]

        async.each(op.get(source, ['targets'], []), function(target, callback) {
            debug('Piping ' + source.value + ' to ' + target.property + ':' + target.fileName)
            var pass = new passThrough
            sourceStream.pipe(pass)
            pass.pipe(fs.createWriteStream('temp/' + target.property + '.' + target.fileName ))
            pass.on('end', callback)
        },
        function(err) {
            if (err) { return callback(err) }
            callback()
        })
    },
    function(err) {
        if (err) {
            debug('Pildimaag stopped with error.', err)
            throw err
        }
        debug('file fetch success')
        callback(null)
    })
}

function removeExtra(results, callback) {
    if (op.get(results, ['prepareTasks', 'tasks'], []).reduce(function(sum, a) {
        return sum + op.get(a, ['toRemove', 'targets'], []).length
    }, 0) === 0) { return callback(null) }

    return callback(null)
    debug('          ---------------------- FOOOOOÖö 1          ---------------------- ')
    entu.getEntity(results.prepareTasks.entityId, results.entuOptions)
    .then(function(request) {
        debug('          ---------------------- FOOOOOÖö 2          ---------------------- ')
        request.on('response', function(response) {
              debug('response', response.statusCode) // 200
              debug('response', response.headers['content-type']) // 'image/png'
        })
        .on('error', function(err) {
            console.log('error', JSON.stringify(err))
        })
        .pipe(fs.createWriteStream('./doodle.jpg'))
    })
    .catch(function(reason) {
        debug('reason', JSON.stringify(reason))
    })
}



var updateQueue = async.queue( function (updateTask, callback) {
    // debug('Adding new task to job "' + updateTask.job.name + '" queue: ' + JSON.stringify(updateTask.item))
    async.auto({
        entuOptions: function(callback) {
            callback(null, updateTask.entuOptions)
        },
        prepareTasks: ['entuOptions', function(callback, results) {
            prepareTasks(updateTask, results, callback)
        }],
        createMissing: ['prepareTasks', function(callback, results) {
            debug('results', JSON.stringify(results, null, 4))
            createMissing(results, callback)
        }],
        // removeExtra: ['prepareTasks', function(callback, results) {
        //     // debug('results', JSON.stringify(results, null, 4))
        //     removeExtra(results, callback)
        // }],
    }, function(err, results) {
        if (err) {
            return debug('Failed to add new task to job "' + updateTask.job.name + '" task item: ' + JSON.stringify(updateTask.item), JSON.stringify(err))
        }
        var toCreate = op.get(results, ['prepareTasks', 'tasks'], []).reduce(function(sum, a) {
            return sum + op.get(a, ['toCreate'], []).reduce(function(sum, b) {
                return sum + op.get(b, ['targets'], []).length
            }, 0)
        }, 0)
        var toRemove = op.get(results, ['prepareTasks', 'tasks'], []).reduce(function(sum, a) {
            return sum + op.get(a, ['toRemove', 'targets'], []).length
        }, 0)
        if (toCreate + toRemove) {
            debug('Job "' + updateTask.job.name + '", task item: ' + JSON.stringify(updateTask.item) + ' at ', new Date(updateTask.item.timestamp * 1e3))
            debug('|__ :', JSON.stringify({toCreate:toCreate, toRemove:toRemove}))
        }
        callback()
    })
}, CPU_COUNT)
updateQueue.drain = function() {
    debug('=== UPDATEQUEUE: ALL ITEMS HAVE BEEN PROCESSED ===')
}





var uploadQueue = async.queue( function (task, callback) {
    callback()
})
uploadQueue.drain = function() {
    debug('uploadQueue: all items have been processed')
}



module.exports = updateQueue

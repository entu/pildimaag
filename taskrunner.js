var fs              = require('fs')
var path            = require('path')
var debug           = require('debug')('app:' + path.basename(__filename).replace('.js', ''))
var async           = require('async')
var op              = require('object-path')
var Promise         = require('promise')
var entu            = require('entulib')
// var Promise  = require('promise/lib/rejection-tracking').enable( {allRejections: true} )


function runTask(task, entuOptions) {
    // console.log(entu)
    return new Promise(function (fulfill, reject) {
        // console.log(task)
        console.log('Definitions:', task.source.definitions, 'entuOptions:', entuOptions)
        async.eachSeries(task.source.definitions, function iterator(definition, callback) {
            var resultPage = 0
            var resultTotal = 0
            var filteredTotal = 0
            var resultCount

            function countResults(result) {
                resultTotal = result.total
                resultCount = result.count + resultPage * task.pageSize
                resultPage = resultPage + 1
                debug(resultCount + '/' + resultTotal + '(page ' + resultPage + ') results from ' + entuOptions.entuUrl + '/entity/' + definition + ': ' + result.entities.length)
                // console.log('---1 ', JSON.stringify(result.entities.map(function(opE){return opE.get('id')}), null, 4))
                return result.entities
            }

            // Add missing target files of opEntities to tasksToDo
            function filterResults(opEntities) {

                // Add missing target files (taskToDo) of opEntity to tasksToDo
                function scanSourceProperty(opEntity, sourceProperty, task, tasksToDo, callback) {

                    // Add missing target files of sourceProperty to taskToDo
                    function markTasks (sourceProperty, taskTarget, opEntity, taskToDo, callback) {
                        var sourceExtName = path.extname(sourceProperty.value)
                        var sourceFilename = path.basename(sourceProperty.value, sourceExtName)
                        var targetFullname = taskTarget.fileNamePrefix + sourceFilename + taskTarget.fileNameSuffix + sourceExtName
                        var existingTargetFullnames = opEntity.get(['properties', taskTarget.property], [])
                            .map(function(targetFile) {
                                op.push(taskToDo, ['evaluate', taskTarget.property, targetFile.value], {
                                    id: targetFile.id,
                                    property: taskTarget.property,
                                    filename: targetFile.value
                                })
                                return targetFile.value
                            })

                        if (existingTargetFullnames.indexOf(targetFullname) > -1) {
                            op.push(taskToDo, ['keep'], {
                                property: taskTarget.property,
                                filename: targetFullname
                            })
                            op.del(taskToDo, ['evaluate', taskTarget.property, targetFullname])
                        }
                        else {
                            op.push(taskToDo, ['create'], {
                                property: taskTarget.property,
                                filename: targetFullname
                            })
                        }
                        callback()
                    }

                    var taskToDo = {
                        entityId:   opEntity.get(['id']),
                        propertyId: sourceProperty.id,
                        url:        sourceProperty.file,
                        filename:   sourceProperty.value
                    }
                    async.eachSeries(task.targets, function (taskTarget, callback) {
                        markTasks(sourceProperty, taskTarget, opEntity, taskToDo, callback)
                    }, function(err) {
                        if (err) { return reject(err) }
                        tasksToDo.push(taskToDo)
                        callback()
                    })
                }

                return new Promise(function (fulfill, reject) {
                    // console.log('---2 ', JSON.stringify(opEntities.map(function(opE){return opE.get('id')}), null, 4))
                    var tasksToDo = []
                    // For each entity detect and mark:
                    // - missing target files are queued to "create"
                    // - orphan target files are queued to "remove"
                    async.eachSeries(opEntities, function (opEntity, callback) {
                        // debug('task for ID', opEntity.get(['id']))
                        async.eachSeries(opEntity.get(['properties', task.source.property], []), function (sourceProperty, callback) {
                            // debug('task for sourceProperty', sourceProperty.file)
                            scanSourceProperty(opEntity, sourceProperty, task, tasksToDo, callback)
                        }, function(err) {
                            if (err) { return callback(err) }
                            callback()
                        })
                    }, function(err) {
                        if (err) { return reject(err) }
                        return fulfill(tasksToDo)
                    })
                })
            }

            function processImages(tasksToDo) {
                resultTotal = result.total
                resultCount = result.count + resultPage * task.pageSize
                resultPage = resultPage + 1
                debug(resultCount + '/' + resultTotal + '(page ' + resultPage + ') results from ' + entuOptions.entuUrl + '/entity/' + definition + ': ' + result.entities.length)
                // console.log('---1 ', JSON.stringify(result.entities.map(function(opE){return opE.get('id')}), null, 4))
                return result.entities
            }


            async.until(function test(callback) {
                return resultCount === resultTotal
            }, function iterator(callback) {
                entu.getEntities(definition, task.pageSize, resultPage + 1, entuOptions)
                    .then( countResults )
                    .then( filterResults )
                    .then( function(tasksToDo) {
                        if (tasksToDo.length) {
                            debug('  ===> ' + tasksToDo.length + ' files to process on ' + entuOptions.entuUrl )
                            console.log('tasksToDo', JSON.stringify(tasksToDo, null, 4))
                        }
                        setTimeout(callback, entuOptions.relaxBetweenPages * 1e3)
                    })
                    .catch( function(err) {
                        console.log(err)
                        return callback(err)
                    })

            }, function finalCB(err) {
                debug('Finished with ' + resultCount + ' results of ' + definition + ' on ' + entuOptions.entuUrl )
                return callback(err)
            })

        }, function(err) {
            if (err) { return reject(err) }
            return fulfill('Task finished: "' + task.name + '"')
        })
    })
}

module.exports = runTask

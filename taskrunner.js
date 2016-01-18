var fs              = require('fs')
var path            = require('path')
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
            var pageSize = 4
            var resultPage = 0
            var resultTotal = 0
            var filteredTotal = 0
            var resultCount

            function countResults(result) {
                resultTotal = result.total
                resultCount = result.count + resultPage * pageSize
                resultPage = resultPage + 1
                console.log(resultCount + '/' + resultTotal + '(page ' + resultPage + ') results from ' , entuOptions.entuUrl, definition , result.entities.length)
                // console.log('---1 ', JSON.stringify(result.entities.map(function(opE){return opE.get('id')}), null, 4))
                return result.entities
            }
            function filterResults(opEntities) {
                return new Promise(function (fulfill, reject) {
                    // console.log('---2 ', JSON.stringify(opEntities.map(function(opE){return opE.get('id')}), null, 4))
                    var filtered = {}
                    async.eachSeries(opEntities, function (opEntity, callback) {
                        async.eachSeries(opEntity.get(['properties', task.source.property], []), function (sourceProperty, callback) {
                            var sourceExtName = path.extname(sourceProperty.value)
                            var sourceFilename = path.basename(sourceProperty.value, sourceExtName)
                            async.eachSeries(task.targets, function (taskTarget, callback) {
                                var targetFullname = taskTarget.fileNamePrefix + sourceFilename + taskTarget.fileNameSuffix + sourceExtName
                                var existingTargetFullnames = opEntity.get(['properties', taskTarget.property], []).map(function(targetFile) { return targetFile.value })
                                // console.log(opEntity.get([taskTarget.property], []))
                                console.log(targetFullname + '?==' + taskTarget.property, JSON.stringify(existingTargetFullnames, null, 4))
                                if (existingTargetFullnames.indexOf(targetFullname) > -1) {
                                    console.log('MATCH ' + targetFullname + ' for ' + opEntity.get('id'))
                                    return callback()
                                }
                                op.set(filtered, [opEntity.get(['id']), 'entityId'], opEntity.get(['id']))
                                op.set(filtered, [opEntity.get(['id']), 'sourceUrl'], sourceProperty.file)
                                op.set(filtered, [opEntity.get(['id']), 'target', taskTarget.property], targetFullname)
                                callback()
                            }, function(err) {
                                if (err) { return reject(err) }
                                // console.log('A ', JSON.stringify(filtered, null, 4))
                                callback()
                            })
                        }, function(err) {
                            if (err) { return reject(err) }
                            // console.log('B ', JSON.stringify(filtered, null, 4))
                            callback()
                        })
                    }, function(err) {
                        if (err) { return reject(err) }
                        console.log('C ', JSON.stringify(filtered, null, 4))
                        return fulfill(filtered)
                    })
                })
            }
            async.until(function test(callback) {
                return resultCount === resultTotal
            }, function iterator(callback) {
                entu.getEntities(definition, pageSize, resultPage + 1, entuOptions)
                    .then( countResults )
                    .then( filterResults )
                    .then( function(filtered) {
                        if (filtered.length) {
                            console.log('filtered', filtered)
                            filteredTotal = filteredTotal + 1
                        }
                        callback()
                    })
                    .catch( function(err) {
                        console.log(err)
                        return callback(err)
                    })

            }, function finalCB(err) {
                console.log(resultCount + '===' + resultTotal, 'Finished ', entuOptions.entuUrl, 'Matched ', filteredTotal, definition)
                return callback(err)
            })

        }, function(err) {
            if (err) { return reject(err) }
            return fulfill('Task finished: "' + task.name + '"')
        })
    })
}

module.exports = runTask

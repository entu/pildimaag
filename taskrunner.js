var fs              = require('fs')
var path            = require('path')
var async           = require('async')
var Promise         = require('promise')
var entu            = require('entulib')
// var Promise  = require('promise/lib/rejection-tracking').enable( {allRejections: true} )


function runTask(task, entuOptions) {
    // console.log(entu)
    return new Promise(function (fulfill, reject) {
        // console.log(task)
        console.log('Definitions:', task.source.definitions, 'entuOptions:', entuOptions)
        async.eachSeries(task.source.definitions, function(definition, callback) {
            var pageSize = 4
            var resultPage = 0
            var resultTotal = 0
            var resultCount
            async.until(function test(callback) {
                return resultCount === resultTotal
            }, function iterator(callback) {
                entu.getEntities(definition, pageSize, resultPage + 1, entuOptions)
                .then( function(result) {
                    resultTotal = result.total
                    resultCount = result.count + resultPage * pageSize
                    resultPage = resultPage + 1
                    console.log(resultCount + '/' + resultTotal + '(page ' + resultPage + ') results from ', entuOptions.entuUrl, definition, result.entities.map(function(r) {return r.get('id')}))
                    callback()
                })
                .catch( function(err) {
                    console.log(err)
                    return callback(err)
                })

            }, function finalCB(err) {
                console.log(resultCount + '===' + resultTotal, 'Finished ', entuOptions.entuUrl, definition)
                return callback(err)
            })

        }, function(err) {
            if (err) { return reject(err) }
            return fulfill('Task finished: "' + task.name + '"')
        })
    })
}

module.exports = runTask

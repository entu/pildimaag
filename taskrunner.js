var fs              = require('fs')
var path            = require('path')
var async           = require('async')
var Promise         = require('promise')
// var Promise  = require('promise/lib/rejection-tracking').enable( {allRejections: true} )


function runTask(task) {
    return new Promise(function (fulfill, reject) {
        console.log('Task: ', task.name)
        return fulfill('ok')
    })
}

module.exports = runTask

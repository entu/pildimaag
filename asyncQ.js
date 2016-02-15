var fs              = require('fs')
var path            = require('path')
var debug           = require('debug')('app:' + path.basename(__filename).replace('.js', ''))
var async           = require('async')
var op              = require('object-path')
var entu            = require('entulib')
var gm              = require('gm')
var passThrough     = require('stream').PassThrough

var exify           = require('./exify.js')

var CPU_COUNT = 4

// Generate structure like in ./data flow model.md
function prepareTasks(updateTask, results, callback) {
    function targetFilename(sourceFilename, template) {
        var sourceExtName = path.extname(sourceFilename)
        sourceFilename = sourceFilename.substr(0, sourceFilename.length - sourceExtName.length)
        return template.fileNamePrefix + sourceFilename + template.fileNameSuffix + '.' + template.format
    }
    // debug('1:', JSON.stringify(updateTask))
    entu.getEntity(updateTask.item.id, results.entuOptions)
    .then(function(opEntity) {
        var returnTasks = op.get(updateTask.job, ['tasks'], []).map(function(_task) { // For every task
            var returnTask = {
                jobName: _task.name,
                toCreate: [],
                toKeep: [],
                toRemove: []
            }
            if (op.get(_task,['source', 'definitions'], []).indexOf(op.get(updateTask, ['item', 'definition'])) === -1) {
                return returnTask
            }
            // debug('1:', JSON.stringify(updateTask.job))

            // Collect all existing files that are candidates for removal
            // If _template.forceKeepInSync, then all existing files are candidates
            //   else only files created by Pildimaag will be evaluated for removal
            _task.targets.forEach(function(_template) { // For every template
                // debug('1.1:', JSON.stringify(_template))
                var existingFiles = opEntity.get(['properties', _template.property], [])
                // debug('1.2:', JSON.stringify(existingFiles))
                // NOTE forceKeepInSync indicates, if we want to remove files created by others
                existingFiles = existingFiles.filter(function(a) {
                    if (_template.forceKeepInSync === true) { return true }
                    if (Number(results.entuOptions.user) === Number(a.created_by)) { return true }
                    returnTask.toKeep.push(a)
                    return false
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
                        maxWidth: _template.maxWidth,
                        maxHeight: _template.maxHeight,
                        crop: _template.crop,
                        metaFields: _template.metaFields,
                        subs: _template.subs,
                        exif: _template.exif,
                    }
                    if (target.subs) {
                        target.subs.text = target.subs.text ? target.subs.text.split('@mapping._id@').join(opEntity.get(['id'])) : ''
                        Object.keys(target.metaFields).forEach(function(label) {
                            var mappedTo = target.metaFields[label]
                            var search = '@mapping.' + label + '@'
                            var replace = opEntity.get(['properties', mappedTo, 0, 'value'], 'N/A')
                            target.subs.text = target.subs.text.split(search).join(replace)
                        })
                    }
                    if (target.exif) {
                        Object.keys(target.exif).forEach(function(exifProperty) {
                            target.exif[exifProperty] = target.exif[exifProperty].split('@mapping._id@').join(opEntity.get(['id']))
                            Object.keys(target.metaFields).forEach(function(label) {
                                var mappedTo = target.metaFields[label]
                                var search = '@mapping.' + label + '@'
                                var replace = opEntity.get(['properties', mappedTo, 0, 'value'], mappedTo)
                                target.exif[exifProperty] = target.exif[exifProperty].split(search).join(replace)
                            })
                        })
                    }

                    // For every source file on template check, if target is already scheduled (by another task)
                    var currentTargetIx = toCreate.targets.map(function(a) { return JSON.stringify(a) }).indexOf(JSON.stringify(target))
                    if (currentTargetIx === -1) {
                        toCreate.targets.push(target)
                        currentTargetIx = toCreate.targets.length - 1
                    }

                    // Match current target against existing files and decide:
                    // - if current file needs to be removed (returnTask.toRemove);
                    // - if new file needs to be created (returnTask.toKeep).
                    returnTask.toRemove = returnTask.toRemove.filter(function(a){
                        if (a.value === target.fileName) {
                            toCreate.targets.splice(currentTargetIx, 1)
                            return false
                        } else {
                            return true
                        }
                    })
                    returnTask.toKeep.forEach(function(a) {
                        if (a.value === target.fileName) {
                            toCreate.targets.splice(currentTargetIx, 1)
                        }
                    })
                })
                returnTask.toCreate.push(toCreate)
            })
            // debug('3:', JSON.stringify(returnTask))
            return returnTask
        })
        callback(null, {entityId: updateTask.item.id, definition: updateTask.item.definition, tasks: returnTasks})
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
            console.log('reason 3', reason)
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
    debug('\n==== Download sources')

    var sources = results.prepareTasks.tasks.reduce(function(arr, a) { return arr.concat(a.toCreate) }, [])
    async.each(sources, function iterator(source, callback) {
        debug('Process source', JSON.stringify(source))
        var entuSourceStream = entu.createReadStream(source.file, results.entuOptions)
            .on('response', function(response) {
                debug('response', response.statusCode, response.headers['content-type']) // 200, 'image/png'
            })
            .on('error', function(err) {
                console.log('error', JSON.stringify(err))
            })
        var originalFilepath = './temp/ORIGINAL_' + source.id
        var originalWriteStream = fs.createWriteStream(originalFilepath)
        entuSourceStream.pipe(originalWriteStream)
        originalWriteStream.on('finish', function() {
            async.forEachOfSeries(op.get(source, ['targets'], []), function(target, ix, callback) {
                debug('Piping ', JSON.stringify(target, null, 4))
                // debug('Piping ' + target.property + ' from ' + originalFilepath + ' to ' + target.fileName)

                var sourceStream
                try {
                    sourceStream = fs.createReadStream(originalFilepath)
                } catch (err) {
                    throw new Error({ m: 'Problems with ' + originalFilepath, e: err })
                }

                var finalFilePath = 'temp/' + source.id + '.' + ix + '.' + target.format
                var finalStream = fs.createWriteStream(finalFilePath)
                finalStream.on('finish', function() {
                    debug('Apply EXIF')
                    exify(finalFilePath, target.exif, function(err, response) {
                        if (err) {
                            debug( 'EXIF not set:\n' + err)
                        }
                        debug('finished processing of ' + JSON.stringify(source) + '.' + JSON.stringify(target), JSON.stringify(results.entuOptions))
                        var fileOptions = {
                            'entityId' : results.prepareTasks.entityId,
                            'property' : results.prepareTasks.definition + '-' + target.property,
                            'filename' : target.fileName,
                            'filetype' : 'image/jpeg',
                            'filesize' : fs.statSync(finalFilePath).size,
                            'filepath' : finalFilePath
                        }
                        entu.uploadFile(fileOptions, results.entuOptions)
                        .then(function() {
                            debug('fs.unlink(finalFilePath)' + finalFilePath)
                            fs.unlink(finalFilePath)
                            callback()
                        })
                        .catch(function(err) {
                            debug('Something went wrong with upload', err)
                            throw new Error({ m: 'Something went wrong', e: err })
                        })
                    })
                })

                var passToResize = new passThrough()
                sourceStream.pipe(passToResize)
                var passCropped = new passThrough()

                if (!target.subs) {
                    debug('no subs')
                    gm(passCropped)
                    .quality(100)
                    .stream(target.format)
                    .pipe(finalStream)
                }
                else {
                    var appendBgFilename = 'temp/bg_' + source.id + '.' + ix + '.png'
                    finalStream.on('finish', function(){
                        debug('fs.unlink(appendBgFilename)' + appendBgFilename)
                        fs.unlink(appendBgFilename)
                    })
                    debug('subbing with ' + target.subs.text)
                    var passToAddSubs = new passThrough()
                    passCropped.pipe(passToAddSubs)

                    var finalBgStream = fs.createWriteStream(appendBgFilename)

                    var width = target.maxWidth ? target.maxWidth : target.fixWidth
                    target.subs.text = target.subs.text || 'abrakadabra mims leidfg asdgiooh asgoasdgl adfgladskg ais gaodshgoa sdiohia sdgas.'
                    gm(width, target.subs.height, '#' + target.subs.backgroundColor)
                    .fontSize(12)
                    .fill("#000000")
                    // .fill('#' + ('000000' + parseInt(Math.random()*256*256*256, 10).toString(16)).slice(-6))
                    .drawText(0, 0, target.subs.text, 'center')
                    .quality(100)
                    .stream('png')
                    .pipe(finalBgStream)

                    finalBgStream.on('finish', function() {
                        gm(passToAddSubs)
                        .append(appendBgFilename)
                        .stream(target.format)
                        .pipe(finalStream)
                    })
                }
                debug('Resizing ', JSON.stringify(target))
                if (target.fixWidth && target.fixHeight) {
                    debug('Resizing fix-fix')
                    gm(passToResize)
                    .resize(target.fixWidth, target.fixHeight, '^')
                    .gravity('Center')
                    .crop(target.fixWidth, target.fixHeight)
                    .stream(target.format)
                    .pipe(passCropped)
                }
                else if (target.maxWidth && target.fixHeight) {
                    debug('Resizing max-fix')
                    gm(passToResize)
                    .resize(null, target.fixHeight)
                    .gravity('Center')
                    .crop(target.maxWidth, target.fixHeight)
                    .extent(target.maxWidth, target.fixHeight)
                    .stream(target.format)
                    .pipe(passCropped)
                }
                else if (target.fixWidth && target.maxHeight) {
                    debug('Resizing fix-max')
                    gm(passToResize)
                    .resize(target.fixWidth, null)
                    .gravity('Center')
                    .crop(target.fixWidth, target.maxHeight)
                    .extent(target.fixWidth, target.maxHeight)
                    .stream(target.format)
                    .pipe(passCropped)
                }
                else if (target.maxWidth && target.maxHeight) {
                    debug('Resizing max-max')
                    gm(passToResize)
                    .resize(target.maxWidth, target.maxHeight)
                    .extent(target.maxWidth, target.maxHeight)
                    .gravity('Center')
                    .stream(target.format)
                    .pipe(passCropped)
                }
            },
            function(err) {
                fs.unlink(originalFilepath)
                if (err) { return callback(err) }
                callback()
            })

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



var jobQueue = async.queue( function (updateTask, callback) {
    // debug('Adding new task to job "' + updateTask.job.name + '" queue: ' + JSON.stringify(updateTask.item))
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
jobQueue.drain = function() {
    debug('=== JOBQUEUE: ALL ITEMS HAVE BEEN PROCESSED ===')
}





var uploadQueue = async.queue( function (task, callback) {
    callback()
})
uploadQueue.drain = function() {
    debug('uploadQueue: all items have been processed')
}



module.exports = jobQueue

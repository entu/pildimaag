const fs = require('fs')
const path = require('path')
const debug = require('debug')('app:' + path.basename(__filename).replace('.js', ''))
const async = require('async')
const op = require('object-path')
const entu = require('entulib')
const gm = require('gm')
const PassThrough = require('stream').PassThrough

// const exify = require('./exify.js')

// var CPU_COUNT = 4

// Generate structure like in ./data flow model.md
function prepareTasks (updateTask, results, callback) {
  function trimExtension (filename) {
    var extension = path.extname(filename)
    return filename.substr(0, filename.length - extension.length)
  }
  function targetFilename (sourceFilename, template) {
    return template.fileNamePrefix + trimExtension(sourceFilename) + template.fileNameSuffix + '.' + template.format
  }
  // debug('1: updateTask', JSON.stringify(updateTask, null, 4))
  entu.getEntity(updateTask.item.id, results.entuOptions)
    .then(function (opEntity) {
      var returnTasks = op.get(updateTask.job, ['tasks'], []).map(function (_task) { // For every task
        var returnTask = {
          jobName: _task.name,
          toCreate: [],
          toKeep: [],
          toRemove: []
        }
        if (op.get(_task, ['source', 'definitions'], []).indexOf(op.get(updateTask, ['item', 'definition'])) === -1) {
          return returnTask
        }
        // debug('1.1 updateTask.job:', JSON.stringify(updateTask.job, null, 4))

        // Collect all existing files that are candidates for removal
        // If _template.forceKeepInSync, then all existing files are candidates
        //   else only files created by Pildimaag will be evaluated for removal
        _task.targets.forEach(function (_template) { // For every template
          // debug('1.1:', JSON.stringify(_template))
          var existingFiles = opEntity.get(['properties', _template.property, 'values'], [])
          // debug('1.2:', JSON.stringify(existingFiles))
          // NOTE forceKeepInSync indicates, if we want to remove files created by others
          existingFiles = existingFiles.filter(function (a) {
            if (_template.forceKeepInSync === true) { return true }
            if (Number(results.entuOptions.user) === Number(a.created_by)) { return true }
            returnTask.toKeep.push(a)
            return false
          })
          returnTask.toRemove = returnTask.toRemove.concat(existingFiles)
        // debug('1.3:', JSON.stringify(opEntity.get(['properties', _template.property], []), null, 2))
        })
        // debug('2:', JSON.stringify(returnTask))

        opEntity.get(['properties', _task.source.property, 'values'], []).forEach(function (_toCreate) { // For every source file
          debug('_toCreate:', _toCreate)
          var toCreate = {
            value: _toCreate.value,
            id: _toCreate.id,
            file: _toCreate.db_value,
            targets: []
          }
          _task.targets.forEach(function (_template) { // For every template
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
              exif: _template.exif
            }
            if (target.subs) {
              target.subs.mappedText = target.subs.text ? target.subs.text.split('@mapping._id@').join(opEntity.get(['id'])) : ''
              Object.keys(target.metaFields).forEach(function (label) {
                var mappedTo = target.metaFields[label]
                var search = '@mapping.' + label + '@'
                var replace = opEntity.get(['properties', mappedTo, 'values', 0, 'value'], 'N/A')
                target.subs.mappedText = target.subs.mappedText.split(search).join(replace)
              })
            }
            if (target.exif) {
              Object.keys(target.exif).forEach(function (exifProperty) {
                target.exif[exifProperty] = target.exif[exifProperty].split('@mapping._id@').join(opEntity.get(['id']))
                Object.keys(target.metaFields).forEach(function (label) {
                  var mappedTo = target.metaFields[label]
                  var search = '@mapping.' + label + '@'
                  var replace = opEntity.get(['properties', mappedTo, 'values', 0, 'value'], mappedTo)
                  target.exif[exifProperty] = target.exif[exifProperty].split(search).join(replace)
                })
              })
            }

            // For every source file on template check, if target is already scheduled (by another task)
            var currentTargetIx = toCreate.targets.map(function (a) { return JSON.stringify(a) }).indexOf(JSON.stringify(target))
            if (currentTargetIx === -1) {
              toCreate.targets.push(target)
              currentTargetIx = toCreate.targets.length - 1
            }

            // Match current target against existing files and decide:
            // - if current file needs to be removed (returnTask.toRemove)
            // - if new file needs to be created (returnTask.toKeep).
            returnTask.toRemove = returnTask.toRemove.filter(function (a) {
              if (trimExtension(a.value) === trimExtension(target.fileName)) {
                toCreate.targets.splice(currentTargetIx, 1)
                return false
              } else {
                return true
              }
            })
            returnTask.toKeep.forEach(function (a) {
              if (trimExtension(a.value) === trimExtension(target.fileName)) {
                toCreate.targets.splice(currentTargetIx, 1)
              }
            })
          })
          returnTask.toCreate.push(toCreate)
        })
        // debug('3:', JSON.stringify(returnTask))
        return returnTask
      })
      return callback(null, { entityId: updateTask.item.id, definition: updateTask.item.definition, tasks: returnTasks })
    })
    .catch(function (reason) {
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

function createMissing (results, callback) {
  debug(JSON.stringify(results, null, 4))
  // debug(JSON.stringify(results.entuOptions, null, 4))

  if (op.get(results, ['prepareTasks', 'tasks'], []).reduce(function (sum, a) {
    return sum + op.get(a, ['toCreate'], []).reduce(function (sum, b) {
      return sum + op.get(b, ['targets'], []).length
    }, 0)
  }, 0) === 0) { return callback(null) }

  var sources = results.prepareTasks.tasks.reduce(function (arr, a) { return arr.concat(a.toCreate) }, [])
  sources.sort(function (a, b) {
    return a.value > b.value ? 1 : -1
  })
  // debug('Process sources', JSON.stringify(sources, null, 4))
  async.eachSeries(sources, function iterator (source, callback) {
    // debug('Process source', JSON.stringify(source, null, 4))
    var fileUrl = results.entuOptions.entuUrl + '/api2/file-' + source.file
    debug('fileUrl:', fileUrl)
    var entuSourceStream = entu.createReadStream(fileUrl, results.entuOptions)
      .on('error', function (err) {
        debug('Problem with source at ' + source.file, err)
        return callback(new ReferenceError('Problem with source at ' + source.file + '\n' + err))
      })
      .on('response', function (response) {
        debug('response', response.statusCode, response.headers['content-type']) // 200, 'image/png'
        if (response.statusCode !== 200) {
          debug('asd: Source not available at ' + source.file)
          return callback(new ReferenceError('Source not available at ' + source.file))
        }
        // return callback(null)
        var originalFilepath = './temp/ORIGINAL_' + source.id
        debug('fs.createWriteStream(originalFilepath): ' + originalFilepath)
        var originalWriteStream = fs.createWriteStream(originalFilepath)
        entuSourceStream.pipe(originalWriteStream)
        originalWriteStream.on('finish', function () {
          async.forEachOfSeries(op.get(source, ['targets'], []), function (target, ix, callback) {
            // debug('Piping ', JSON.stringify(target, null, 4))
            debug('Piping ' + target.property + ' from ' + originalFilepath + ' to ' + target.fileName)

            var sourceStream
            try {
              sourceStream = fs.createReadStream(originalFilepath)
            } catch (err) {
              debug('Failed to create readStream from ' + err)
              return callback(new ReferenceError('Failed to create readStream from ' + originalFilepath + '\n' + err))
            }

            var finalFilePath = './temp/' + source.id + '.' + ix + '.' + target.format
            debug('fs.createWriteStream(finalFilePath): ' + finalFilePath)
            var finalStream = fs.createWriteStream(finalFilePath)
            finalStream.on('finish', function () {
              // debug('Apply EXIF')
              // exify(finalFilePath, target.exif, function (err, response) {
              //   if (err) {
              //     debug( 'WARNING: EXIF has to say this:\n', err)
              //   }
                // debug('finished processing of ' + JSON.stringify(source) + '.' + JSON.stringify(target), JSON.stringify(results.entuOptions))
                try {
                  var fileStats = fs.statSync(finalFilePath)
                  var fileOptions = {
                    'entityId': results.prepareTasks.entityId,
                    'property': results.prepareTasks.definition + '-' + target.property,
                    'filename': target.fileName,
                    'filetype': 'image/jpeg',
                    'filesize': fileStats.size,
                    'filepath': finalFilePath
                  }
                  entu.uploadFile(fileOptions, results.entuOptions)
                    .then(function () {
                      debug('fs.unlinkSync(finalFilePath)' + finalFilePath)
                      fs.unlinkSync(finalFilePath)
                      return callback(null)
                    })
                    .catch(function (err) {
                      console.log('Something went wrong with upload', err)
                      debug('Something went wrong with upload', err)
                      return callback(new Error('Something went wrong with upload' + '\n' + err))
                    })
                } catch (err) {
                  debug('Something went wrong with upload', err)
                  return callback(new Error('Something went wrong with upload' + '\n' + err))
                }
              // })
            })

            var passToResize = new PassThrough()
            sourceStream.pipe(passToResize)
            var passCropped = new PassThrough()

            if (!target.subs) {
              // debug('no subs')
              gm(passCropped)
                .quality(target.quality || 100)
                .stream(target.format)
                .pipe(finalStream)
            } else {
              var appendBgFilename = './temp/bg_' + source.id + '.' + ix + '.png'
              finalStream.on('finish', function () {
                debug('fs.unlinkSync(appendBgFilename)' + appendBgFilename)
                fs.unlinkSync(appendBgFilename)
              })
              debug('subbing with ' + target.subs.mappedText)
              var passToAddSubs = new PassThrough()
              passCropped.pipe(passToAddSubs)

              debug('fs.createWriteStream(appendBgFilename): ' + appendBgFilename)
              var finalBgStream = fs.createWriteStream(appendBgFilename)

              var width = target.maxWidth ? target.maxWidth : target.fixWidth
              target.subs.mappedText = target.subs.mappedText || ''
              gm(width, target.subs.height, '#' + target.subs.backgroundColor)
                .fontSize(12)
                .fill('#000000')
                // .fill('#' + ('000000' + parseInt(Math.random()*256*256*256, 10).toString(16)).slice(-6))
                .drawText(0, 0, target.subs.mappedText, 'center')
                .quality(target.quality || 100)
                .stream('png')
                .pipe(finalBgStream)

              finalBgStream.on('finish', function () {
                gm(passToAddSubs)
                  .append(appendBgFilename)
                  .stream(target.format)
                  .pipe(finalStream)
              })
            }
            // debug('Resizing ', JSON.stringify(target))
            if (target.fixWidth && target.fixHeight) {
              // debug('Resizing fix-fix')
              gm(passToResize)
                .resize(target.fixWidth, target.fixHeight, '^')
                .gravity('Center')
                .crop(target.fixWidth, target.fixHeight)
                .stream(target.format)
                .pipe(passCropped)
            }
            else if (target.maxWidth && target.fixHeight) {
              // debug('Resizing max-fix')
              gm(passToResize)
                .resize(null, target.fixHeight)
                .gravity('Center')
                .crop(target.maxWidth, target.fixHeight)
                .extent(target.maxWidth, target.fixHeight)
                .stream(target.format)
                .pipe(passCropped)
            }
            else if (target.fixWidth && target.maxHeight) {
              // debug('Resizing fix-max')
              gm(passToResize)
                .resize(target.fixWidth, null)
                .gravity('Center')
                .crop(target.fixWidth, target.maxHeight)
                .extent(target.fixWidth, target.maxHeight)
                .stream(target.format)
                .pipe(passCropped)
            }
            else if (target.maxWidth && target.maxHeight) {
              // debug('Resizing max-max')
              gm(passToResize)
                .resize(target.maxWidth, target.maxHeight)
                // .gravity('South')
                // .extent(target.maxWidth, target.maxHeight)
                .gravity('Center')
                .stream(target.format)
                .pipe(passCropped)
            }
            else if (target.fixWidth && !target.maxHeight && !target.fixHeight) {
              // debug('Resizing width only')
              gm(passToResize)
                .resize(target.fixWidth)
                // .gravity('South')
                // .extent(target.maxWidth, target.maxHeight)
                .gravity('Center')
                .stream(target.format)
                .pipe(passCropped)
            }
          },
            function (err) {
              if (err) {
                console.log(err)
                return callback(err)
              }
              debug('fs.unlinkSync(originalFilepath)' + originalFilepath)
              fs.unlinkSync(originalFilepath)
              return callback(null)
            })
        })
      })
  },
    function (err) {
      if (err) {
        debug('123: Failed to process source.', err)
        return callback(null)
        // return callback('Failed to process source.' + '\n' + err)
      }
      debug('Sources successfully processed.')
      return callback(null)
    })
}

function removeExtra (results, callback) {
  if (op.get(results, ['prepareTasks', 'tasks'], []).reduce(function (sum, a) {
    return sum + op.get(a, ['toRemove', 'targets'], []).length
  }, 0) === 0) { return callback(null) }

  return callback(null)
// debug('          ---------------------- FOOOOOÖö 1          ---------------------- ')
// entu.getEntity(results.prepareTasks.entityId, results.entuOptions)
// .then(function(request) {
//     debug('          ---------------------- FOOOOOÖö 2          ---------------------- ')
//     request.on('response', function(response) {
//           debug('response', response.statusCode) // 200
//           debug('response', response.headers['content-type']) // 'image/png'
//     })
//     .on('error', function(err) {
//         console.log('error', JSON.stringify(err))
//     })
//     .pipe(fs.createWriteStream('./doodle.jpg'))
// })
// .catch(function(reason) {
//     debug('reason', JSON.stringify(reason))
// })
}

var jobQueue = async.queue(function (updateTask, callback) {
  debug('   <X = #' + updateTask.jobIncrement + '> Executing task for job "' + updateTask.job.name +
    '" queue: ' + JSON.stringify(updateTask.item) +
    // '" task: ' + JSON.stringify(updateTask) +
    ' Sanity check: ' + op.get(updateTask, ['job','tasks',0,'targets',0,'subs','mappedText'], 'Fail'))
  async.auto({
    entuOptions: function (callback) {
      return callback(null, updateTask.entuOptions)
    },
    prepareTasks: ['entuOptions', function (callback, results) {
      prepareTasks(updateTask, results, callback)
    }],
    createMissing: ['prepareTasks', function (callback, results) {
      // debug('results', JSON.stringify(results, null, 4))
      createMissing(results, callback)
    }],
    removeExtra: ['prepareTasks', function (callback, results) {
      // debug('results', JSON.stringify(results, null, 4))
      removeExtra(results, callback)
    }]
  }, function (err, results) {
    if (err) {
      debug('   <X ! #' + updateTask.jobIncrement + '> Task failed for job "' + updateTask.job.name + '" task item: ' + JSON.stringify(updateTask.item), err)
      return callback('Task failed for job "' + updateTask.job.name + '"\n' + err)
    }
    var toCreate = op.get(results, ['prepareTasks', 'tasks'], []).reduce(function (sum, a) {
      return sum + op.get(a, ['toCreate'], []).reduce(function (sum, b) {
        return sum + op.get(b, ['targets'], []).length
      }, 0)
    }, 0)
    var toRemove = op.get(results, ['prepareTasks', 'tasks'], []).reduce(function (sum, a) {
      return sum + op.get(a, ['toRemove', 'targets'], []).length
    }, 0)
    if (toCreate + toRemove) {
      debug('#' + updateTask.jobIncrement + ' Job "' + updateTask.job.name + '", task item: ' + JSON.stringify(updateTask.item) + ' at ', new Date(updateTask.item.timestamp * 1e3))
      debug('#' + updateTask.jobIncrement + ' |__ :', JSON.stringify({toCreate: toCreate, toRemove: toRemove}))
    }
    debug('   <X . #' + updateTask.jobIncrement + '> Task finished for job "' + updateTask.job.name + '" queue: ' + JSON.stringify(updateTask.item))
    return callback(null)
  })
}, 1)
jobQueue.drain = function () {
  debug('=== JOBQUEUE: ALL ITEMS HAVE BEEN PROCESSED ===')
}

var uploadQueue = async.queue(function (task, callback) {
  return callback(null)
})
uploadQueue.drain = function () {
  debug('uploadQueue: all items have been processed')
}

module.exports = jobQueue

if(process.env.NEW_RELIC_LICENSE_KEY) require('newrelic')

var request         = require('request')
var fs              = require('fs')
var path            = require('path')
var Transform       = require('stream').Transform

var gm              = require('gm')

var entulib         = require('./entulib.js')
var queue           = require('./queue.js')
var helper          = require('./helper.js')



var pjson = require('./package.json')
console.log('----==== ' + pjson.name + ' v.' + pjson.version + ' ====----')

PAGE_SIZE_LIMIT = 1000
QUEUE_SIZE = 3
FIRST_PAGE = 36
SLEEPING = false
HOME_DIR = path.dirname(process.argv[1])
TEMP_DIR = path.resolve(HOME_DIR, 'temp')
PIC_READ_ENTITY = 'eksponaat'
PIC_READ_PROPERTY = 'photo-orig'
PIC_WRITE_PROPERTY = 'photo'
VALID_EXTENSIONS = ['.jpg', '.pdf', '.tif', '.tiff', '.png', '.jpeg', '.gif']

HOSTNAME = 'okupatsioon.entu.ee'
ENTU_URI = 'https://' + HOSTNAME + '/'
ENTU_API = ENTU_URI + 'api2/'
ENTU_API_ENTITY = ENTU_API + 'entity-'
ENTU_API_POST_FILE = ENTU_API + 'file/s3'

var q = queue(QUEUE_SIZE)
var EntuLib = entulib(process.env.PM_ENTITY, process.env.PM_KEY, HOSTNAME)


var fetchNextPage = function fetchNextPage(page) {
    EntuLib.findEntity(PIC_READ_ENTITY, '', PAGE_SIZE_LIMIT, page, function findEntityCB(err, result) {
        if (err) {
            console.log('findEntityCB: Can\'t reach Entu', err, result)
            setTimeout(function() { fetchNextPage(page) }, 10*1000)
        }
        else if (result.error !== undefined) {
            console.log (result, 'Failed to fetch from Entu.')
            setTimeout(function() { fetchNextPage(page) }, 10*1000)
        } else {
            result.result.forEach(function entityLoop(entity) {
                EntuLib.getEntity(entity.id, function getEntityCB(err, result) {
                    if (err) {
                        console.log('getEntityCB: Can\'t reach Entu', err, result)
                        return
                    }
                    else if (result.error !== undefined) {
                        console.log(result.error, 'Failed to fetch from Entu.')
                        return
                    } else {
                        var photo_property = result.result.properties[PIC_READ_PROPERTY]
                        var thumb_property = result.result.properties[PIC_WRITE_PROPERTY]
                        var code_value = result.result.properties['code'].values ? result.result.properties['code'].values[0].value : ''
                        var nimetus_value = result.result.properties['tag'].values ? result.result.properties['tag'].values[0].value : ''

                        var to_create = {}
                        var to_delete = {}
                        var orig_cnt = 0
                        var thumb_cnt = 0
                        if (photo_property.values) {
                            photo_property.values.forEach(function photoLoop(photo_val) {
                                if (VALID_EXTENSIONS.indexOf(path.extname(photo_val.value).toLowerCase()) === -1) {
                                    console.log(Date().toString() + ' Ignoring file with unsupported extension (' + path.extname(photo_val.value) + ') on entity ' + entity.id)
                                    return
                                }
                                orig_cnt ++
                                to_create[photo_val.value] = photo_val
                            })
                        }
                        if (thumb_property.values) {
                            thumb_property.values.forEach(function thumbLoop(thumb_val) {
                                if (to_create[thumb_val.value]) {
                                    delete to_create[thumb_val.value]
                                    orig_cnt --
                                } else {
                                    to_delete[thumb_val.value] = thumb_val
                                    thumb_cnt ++
                                }
                            })
                        }
                        if (orig_cnt > 0 || thumb_cnt > 0) {
                            console.log(Date().toString() + ' Work on eid:' + entity.id, {"to_create":orig_cnt, "to_delete":thumb_cnt})
                            for (var delete_key in to_delete) {
                                EntuLib.removeProperty(entity.id, PIC_WRITE_PROPERTY, to_delete[delete_key].id, function() {
                                    console.log(Date().toString() + ' Removed thumb ' + to_delete[delete_key].id + ' from entity ' + entity.id)
                                })
                            }
                            for (var create_key in to_create) {
                                var photo_val = to_create[create_key]
                                var jobData = {
                                    'eid':          entity.id,
                                    'photo_db_val': photo_val.db_value,
                                    'photo_val':    photo_val.value,
                                    'code_val':     code_value,
                                    'nimetus_val':  nimetus_value
                                }
                                q.add('Processing photo ' + photo_val.db_value, jobData, function jobFunction(jobData, finalCB) {
                                    // setTimeout(finalCB, 5*1000)
                                    fetchFile(jobData.eid, jobData.photo_db_val, jobData.photo_val, jobData.code_val, jobData.nimetus_val, finalCB)
                                })
                            }
                        }
                    }
                })
            })

            if (q.stats().active) {
                console.log(Date().toString() + '=== Active/queued connections: ' + q.stats().active + '/' + q.stats().queue)
            }
            q.start()

            if (PAGE_SIZE_LIMIT * page < result.count) {
                var fetchIfReady = function fetchIfReady(page) {
                    if (Object.keys(q.stats().jobs).length) {
                        // console.log(Date().toString() + '=== Active jobs: ', q.stats().jobs)
                    }
                    if (q.stats().active === 0) {
                        console.log(Date().toString() + '=== Loading page #' + page + '/' + Math.ceil(result.count/PAGE_SIZE_LIMIT))
                        fetchNextPage(page)
                    } else if (q.stats().active < QUEUE_SIZE) {
                        console.log(Date().toString() + '=== Active/queued connections: ' + q.stats().active + '/' + q.stats().queue + '. Loading next page #' + page + '/' + Math.ceil(result.count/PAGE_SIZE_LIMIT))
                        setTimeout(function() { fetchNextPage(page) }, 1000)
                    } else {
                        // console.log(Date().toString() + '=== Active/queued connections: ' + q.stats().active + '/' + q.stats().queue + '. Postpone next page #' + page + '/' + Math.ceil(result.count/PAGE_SIZE_LIMIT))
                        setTimeout(function() { fetchIfReady(page) }, 10*1000)
                    }
                }
                fetchIfReady(page + 1)
            } else {
                console.log(Date().toString() + '=== New roundtrip in ' + helper.msToTime(1000 * 60 * process.env.PM_NIGHT_MINUTES) + '. Active jobs: ', q.stats().jobs)
                setTimeout(function() { SLEEPING = false }, 1000 * 60 * process.env.PM_NIGHT_MINUTES)
                SLEEPING = true
                setTimeout(function() { fetchNextPage(1) }, 1000 * 60 * process.env.PM_NIGHT_MINUTES)
            }

        }
    })
}

fetchNextPage(FIRST_PAGE)



var total_download_size = 0
var bytes_downloaded = 0

var append_background = path.resolve(HOME_DIR, 'text_background.png')

var fetchFile = function fetchFile(entity_id, file_id, file_name, exp_nr, nimetus, finalCB) {
    // console.log('fetchFile ', entity_id, file_id, file_name, exp_nr, nimetus)
    var original_filepath = path.resolve(TEMP_DIR, file_id + '.' + file_name)
    var original_file_stream = fs.createWriteStream(original_filepath)
    var converted_filepath = path.resolve(TEMP_DIR, file_id + '.' + 'jpg')
    var converted_file_stream = fs.createWriteStream(converted_filepath)

    var validatorTransform = new Transform()
    validatorTransform._transform = function(data, encoding, done) {
        this.push(data)
        original_file_stream.write(data)
        done()
    }

    gm(EntuLib.getFileStream(file_id).pipe(validatorTransform))
    .stream('jpg', function(err, stdout, stderr) {
        gm(stdout)
        .resize(800, 530)
        .rotate('#ffffffff', 0)
        .stream('jpg', function(err, stdout, stderr) {
            gm(stdout)
            .background('#ffffff')
            .append(append_background)
            .stream(function(err, stdout, stderr) {
                gm(stdout)
                .drawText(0, 15, 'Okupatsioonide Muuseum #' + exp_nr + '\n' + nimetus + '\nokupatsioon.entu.ee', 'south')
                .stream(function(err, stdout, stderr) {
                    stdout.pipe(converted_file_stream)
                    stdout.on('end', function() {
                        // setTimeout(finalCB, 10*1000); return; // For dry-run purposes
                        EntuLib.addFile(entity_id, PIC_READ_ENTITY + '-' + PIC_WRITE_PROPERTY, file_name, 'image/jpeg', converted_file_stream.bytesWritten, converted_filepath, function addFileCB(err, result) {
                            if (err) {
                                console.log(Date().toString() + ' SKIPPING OVER: addFileCB: ' + file_name + ' ' + converted_filepath, err, result)
                                return
                            }
                            console.log(Date().toString() + ' Finished upload of ' + original_filepath + ' ' + helper.bytesToSize(converted_file_stream.bytesWritten) + '.')
                            fs.unlink(original_filepath)
                            fs.unlink(converted_filepath)
                        })
                        finalCB()
                    })
                })
            })
        })
    })
}


var pulse_cnt = 0
var pulse_ms = 60*1000
var hibernation_factor = 20
var pulse = function pulse() {
    if (SLEEPING) {
        console.log(Date().toString() + ' ...zzzZZ (' + helper.msToTime(pulse_cnt * pulse_ms) + ')')
        pulse_cnt += hibernation_factor
        setTimeout(function() { pulse() }, pulse_ms * hibernation_factor)
    } else {
        console.log(Date().toString() + ' awake. Lifetime ' + helper.msToTime(pulse_cnt * pulse_ms))
        pulse_cnt ++
        setTimeout(function() { pulse() }, pulse_ms)
    }
}
pulse()



/*
*/

var nomnom          = require('nomnom')
var request         = require('request')
var util            = require('util')
var fs              = require('fs')
var path            = require('path')
var stream          = require('stream')
var Transform       = require('stream').Transform

var gm              = require('gm')

var entulib         = require('./entulib.js')
var queue           = require('./queue.js')
var helper          = require('./helper.js')



var pjson = require('./package.json')
console.log('----==== ' + pjson.name + ' v.' + pjson.version + ' ====----')

PAGE_SIZE_LIMIT = 100
QUEUE_SIZE = 3
FIRST_PAGE = 1
// FIRST_PAGE = 385; PAGE_SIZE_LIMIT = 50
var q = queue(QUEUE_SIZE)

var opts = nomnom.options({
    USER_ID: {
        abbr     : 'e',
        required : true,
        help     : 'Entity ID for Entu API user'
    },
    API_KEY: {
        abbr     : 'k',
        metavar  : 'STRING',
        required : true,
        help     : 'Authentication key'
    },
}).parse()
opts.HOSTNAME = 'okupatsioon.entu.ee'

HOME_DIR = path.dirname(process.argv[1])
TEMP_DIR = path.resolve(HOME_DIR, 'temp')
PIC_READ_ENTITY = 'eksponaat'
PIC_READ_PROPERTY = 'photo-orig'
PIC_WRITE_PROPERTY = 'photo'
VALID_EXTENSIONS = ['.jpg', '.pdf', '.tif', '.tiff', '.png', '.jpeg', '.gif']

var EntuLib = entulib(opts.USER_ID, opts.API_KEY, opts.HOSTNAME)

ENTU_URI = 'https://' + opts.HOSTNAME + '/'
ENTU_API = ENTU_URI + 'api2/'
ENTU_API_ENTITY = ENTU_API + 'entity-'
ENTU_API_POST_FILE = ENTU_API + 'file/s3'

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
                                orig_cnt ++
                                if (VALID_EXTENSIONS.indexOf(path.extname(photo_val.value).toLowerCase()) === -1) {
                                    console.log(Date().toString() + ' IGNORE: file with unsupported extension: ' + path.extname(photo_val.value), photo_val)
                                    return
                                }
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
                            for (var key in to_delete) {
                                EntuLib.removeProperty(entity.id, PIC_WRITE_PROPERTY, to_delete[key].id, function() {
                                    console.log(Date().toString() + ' Removed thumb ' + to_delete[key].id + ' from entity ' + entity.id)
                                })
                            }
                            for (var key in to_create) {
                                var photo_val = to_create[key]
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
                console.log(Date().toString() + '=== New roundtrip. Active jobs: ', q.stats().jobs)
                // process.exit(0)
                setTimeout(function() { fetchNextPage(1) }, 1000 * 60 * 60 * 1)
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
                            console.log(Date().toString() + ' SUCCESS: ' + original_filepath + ' ' + helper.bytesToSize(converted_file_stream.bytesWritten) + '.')
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
var pulse = function pulse(ms) {
    console.log('tick ' + (pulse_cnt ++))
    setTimeout(function() { pulse(ms) }, ms)
}
pulse(60 * 1000)



/*
BUILD, RUN and LOG
docker kill puhh
docker rm puhh
docker build -t mitselek/pildimaag ~/Documents/github/pildimaag/
docker run -d -v ~/Documents/github/pildimaag/:/pildimaag/ --name puhh mitselek/pildimaag:latest -e 155005 -k 378c2VuY
docker logs -f puhh

RESTART and LOG
docker kill puhh
docker start puhh
docker logs -f --tail=15 puhh
*/

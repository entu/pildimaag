var nomnom          = require('nomnom')
var request         = require('request')
var EventEmitter    = require('events').EventEmitter
var fs              = require('fs')
var util            = require('util')
var path            = require('path')
var stream          = require('stream')

var gm              = require('gm')

var entulib         = require('./entulib.js')
var queue           = require('./queue.js')
var helper          = require('./helper.js')

var q = queue(10)

var pjson = require('./package.json')
console.log(pjson.name + ' v.' + pjson.version)

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
PAGE_SIZE_LIMIT = 5
PIC_READ_ENTITY = 'eksponaat'
PIC_READ_PROPERTY = 'photo-orig'
PIC_WRITE_PROPERTY = 'photo'

var EntuLib = entulib(opts.USER_ID, opts.API_KEY, opts.HOSTNAME)
var connection_counter = 0


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
            console.log (result.error, 'Failed to fetch from Entu.')
            setTimeout(function() { fetchNextPage(page) }, 10*1000)
        } else {
            result.result.forEach(function entityLoop(entity) {
                EntuLib.getEntity(entity.id, function getEntityCB(err, result) {
                    if (err) {
                        console.log('getEntityCB: Can\'t reach Entu', err, result)
                        process.exit(99)
                    }
                    else if (result.error !== undefined) {
                        console.log(result.error, 'Failed to fetch from Entu.')
                        process.exit(99)
                    } else {
                        var photo_property = result.result.properties[PIC_READ_PROPERTY]
                        var thumb_property = result.result.properties[PIC_WRITE_PROPERTY]
                        var code_value = result.result.properties['code'].values ? result.result.properties['code'].values[0].value : ''
                        var nimetus_value = result.result.properties['tag'].values ? result.result.properties['tag'].values[0].value : ''
                        if (photo_property.values) {
                            photo_property.values.forEach(function photoLoop(photo_val) {
                                var thumb_is_present = false
                                if (thumb_property.values) {
                                    thumb_property.values.forEach(function thumbLoop(thumb_val) {
                                        if (thumb_val.value === photo_val.value) {
                                            thumb_is_present = true
                                        }
                                    })
                                }
                                if (thumb_is_present) {
                                    return
                                }
                                var jobData = {
                                    'eid':          entity.id,
                                    'photo_db_val': photo_val.db_value,
                                    'photo_val':    photo_val.value,
                                    'code_val':     code_value,
                                    'nimetus_val':  nimetus_value
                                }
                                q.add('Download of ' + photo_val.db_value, jobData, function jobFunction(jobData, finalCB) {
                                    fetchFile(jobData.eid, jobData.photo_db_val, jobData.photo_val, jobData.code_val, jobData.nimetus_val, finalCB)
                                })
                            })
                        }
                    }
                })
            })

            if (PAGE_SIZE_LIMIT * page < result.count) {
                var fetchIfReady = function fetchIfReady(page) {
                        fetchNextPage(page)
                }
                fetchIfReady(page + 1)
            } else {
                console.log('No more pages for today.')
                // process.exit(0)
                // setTimeout(function() { fetchNextPage(1) }, 1000 * 10 * 1 * 1)
                // setTimeout(function() { fetchNextPage(1) }, 1000 * 60 * 60 * 24)
            }

        }
    })
}

fetchNextPage(3200)

var MAX_DOWNLOAD_TIME = 60 * 60 // seconds
var total_download_size = 0
var bytes_downloaded = 0

var append_background = path.resolve(HOME_DIR, 'text_background.png')

var fetchFile = function fetchFile(entity_id, file_id, file_name, exp_nr, nimetus, finalCB) {
    EventEmitter.call(this)
    var self = this

    var t = setTimeout(function() {
        self.emit('error', 'Error: ' + fetch_uri + ' timed out!', 95)
    }, MAX_DOWNLOAD_TIME * 1000)

    var fetch_uri = 'https://' + opts.HOSTNAME + '/api2/file-' + file_id
    var download_filename = path.resolve(TEMP_DIR, file_id + '.' + 'jpg')

    gm(request
        .get(fetch_uri)
        .on('error', function(err) {
            console.log('WARNING: request: ' + fetch_uri , err)
            setTimeout(function() { fetchFile(entity_id, file_id, file_name, exp_nr, nimetus) }, 10 * 1000)
            return
        })
        .on('response', function response_handler( response ) {
            var filesize = response.headers['content-length']
            if (filesize === undefined) {
                console.log('WARNING: filesize === undefined: ' + fetch_uri  + '.')
                // setTimeout(function() { fetchFile(entity_id, file_id, file_name, exp_nr, nimetus) }, 10 * 1000)
                return
            } else {
                total_download_size += Number(filesize)
            }
            response.on('data', function(chunk) {
                bytes_downloaded += chunk.length
                if (filesize === undefined) {
                    // console.log('WARNING: filesize === undefined:' + fetch_uri + ' loaded chunk of ' + chunk.length + ' bytes.')
                    total_download_size += chunk.length
                    // console.log(chunk.toString('utf8'))
                }
                // console.log('Progress: ' + file_name + ' - ' + helper.bytesToSize(total_download_size) + ' - ' + helper.bytesToSize(bytes_downloaded) + ' = ' + helper.bytesToSize(total_download_size - bytes_downloaded) )
            })
            response.on('end', function() {
                if (response.statusCode === 200) {
                    // console.log('Finished: ' + fetch_uri + ' - ' + helper.bytesToSize(total_download_size) + ' - ' + helper.bytesToSize(bytes_downloaded) + ' = ' + helper.bytesToSize(total_download_size - bytes_downloaded) )
                }
                clearTimeout(t)
            })
        })
    )
    .resize(800, 530)
    .stream('jpg', function(err, stdout, stderr) {
        gm(stdout)
        .append(append_background)
        // .append(gm(240, 70))
        .stream(function(err, stdout, stderr) {
            gm(stdout)
            .drawText(0, 15, 'Okupatsioonide Muuseum #' + exp_nr + '\n' + nimetus + '\nokupatsioon.entu.ee', 'south')
            .stream(function(err, stdout, stderr) {
                if (err) {
                    console.log('WARNING: bm.stream: ' + fetch_uri , err)
                    // setTimeout(function() { fetchFile(entity_id, file_id, file_name, exp_nr, nimetus) }, 10 * 1000)
                    return
                }
                var f = fs.createWriteStream(download_filename)
                stdout.pipe(f)
                f.on('finish', function() {
                    if (f.bytesWritten === 0) {
                        console.log('WARNING: f.bytesWritten === 0: ' + fetch_uri  + '.')
                        // setTimeout(function() { fetchFile(entity_id, file_id, file_name, exp_nr, nimetus) }, 10 * 1000)
                        return
                    }
                    console.log('bytes written: ' + f.bytesWritten);
                    EntuLib.addFile(entity_id, PIC_READ_ENTITY + '-' + PIC_WRITE_PROPERTY, file_name, 'image/jpeg', f.bytesWritten, download_filename, function addFileCB(err, result) {
                        if (err) {
                            console.log('WARNING: addFileCB: ' + fetch_uri , err, result)
                            setTimeout(function() { fetchFile(entity_id, file_id, file_name, exp_nr, nimetus) }, 10 * 1000)
                            return
                        }
                        console.log('SUCCESS: ' + fetch_uri + ' ' + helper.bytesToSize(f.bytesWritten) + '.')
                        finalCB(null)
                    })
                })
            })
        })
    })

}
util.inherits(fetchFile, EventEmitter)


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

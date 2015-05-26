var nomnom          = require('nomnom')
var request         = require('request');
var EventEmitter    = require('events').EventEmitter
var fs              = require('fs')
var util            = require('util')
var path            = require('path')
var stream          = require('stream')
// var http            = require("http");
// var im              = require("imagemagick-stream");
// var im              = require("imagemagick");
// var gm              = require('graphicsmagick-stream')
var gm              = require('gm')

var entulib         = require('./entulib.js')
var helper          = require('./helper.js')

// console.log(process.argv)
var pjson = require('./package.json')
console.log(pjson.name + ' v.' + pjson.version)
// console.log(process)

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
// console.log(opts)

var HOME_DIR = path.dirname(process.argv[1])
var TEMP_DIR = path.resolve(HOME_DIR, 'temp')
var EntuLib = entulib(opts.USER_ID, opts.API_KEY, opts.HOSTNAME)
var LIMIT = 5
var result_counter = 0
var connection_counter = 0

var fetchNextPage = function fetchNextPage(page) {

    connection_counter ++
    EntuLib.findEntity('eksponaat', '00000', LIMIT, page, function findEntityCB(err, result) {
        connection_counter --
        if (err) {
            console.log('Can\'t reach Entu', err, result)
            process.exit(99)
        }
        else if (result.error !== undefined) {
            console.log (result.error, 'Failed to fetch from Entu.')
        } else {

            console.log('Fetched ' + result.result.length + '/' + result.count
                + ' results on page ' + page + '/' + Math.ceil(result.count / LIMIT))
            // console.log(result.result)
            result.result.forEach(function entityLoop(entity) {
                result_counter ++
                // console.log(result_counter + ':', entity.id)

                connection_counter ++
                EntuLib.getEntity(entity.id, function findEntityCB(err, result) {
                    connection_counter --
                    // console.log('#:' + connection_counter)
                    if (err) {
                        console.log('Can\'t reach Entu', err, result)
                        process.exit(99)
                    }
                    else if (result.error !== undefined) {
                        console.log (result.error, 'Failed to fetch from Entu.')
                    } else {
                        // console.log(entity.id + ':', result.result.displayname, result.result.displayinfo)
                        var photo_property = result.result.properties['photo']
                        var code_property = result.result.properties['code']
                        if (photo_property.values) {
                            photo_property.values.forEach(function photoLoop(photo_val) {
                                console.log(entity.id + '/' + photo_val.id + '[' + photo_val.db_value + ']:', photo_val.value)
                                var ff = new fetchFile(photo_val.db_value, photo_val.value, code_property.values[0].value)
                                .on('error', function fileFetchError(err_msg, err_no) {
                                    console.log(err_msg, err_no)
                                    process.exit(err_no)
                                })
                            })
                        }
                    }
                })
            })

            if (LIMIT * page < result.count) {
                fetchNextPage(page+1)
            } else {
                console.log('No more pages for today.')
                // process.exit(0)
                // setTimeout(function() { fetchNextPage(1) }, 1000 * 10 * 1 * 1)
                setTimeout(function() { fetchNextPage(1) }, 1000 * 60 * 60 * 24)
            }

        }
    })
}

fetchNextPage(1)

var max_download_time = 30 // seconds
var loading_process_count = 0
var total_download_size = 0
var bytes_downloaded = 0
var decrementProcessCount = function decrementProcessCount() {
    -- loading_process_count
}
var incrementProcessCount = function incrementProcessCount() {
    ++ loading_process_count
}
var countLoadingProcesses = function countLoadingProcesses() {
    return loading_process_count
}

var append_background = path.resolve(HOME_DIR, 'text_background.png')

var fetchFile = function fetchFile(file_id, file_name, exp_nr) {
    EventEmitter.call(this)
    var self = this

    var t = setTimeout(function() {
        decrementProcessCount()
        console.log('Downloading: ' + file_name + ' - ' + helper.bytesToSize(bytes_downloaded) + ' of ' + helper.bytesToSize(total_download_size))
        self.emit('error', file_id + '|' + file_name + ' timed out!', 95)
    }, max_download_time * 1000)

    var fetch_uri = 'https://' + opts.HOSTNAME + '/api2/file-' + file_id
    var download_filename = path.resolve(TEMP_DIR, file_id + path.extname(file_name))
    console.log(fetch_uri + '-->' + download_filename)

    incrementProcessCount()
    // var resize = im().resize('800x600').quality(90)
    var resize = gm().resize('800x600').append('./text_background.png')

    gm(request
        .get(fetch_uri)
        .on('error', function(err) {
            console.log(err)
        })
        .on('response', function response_handler( response ) {
            var filesize = response.headers['content-length']
            // console.log(response.headers)
            if (filesize) {
                console.log(file_id + '|' + fetch_uri + '|' + file_name + ' has no size!')
                // self.emit('error', file_id + '|' + fetch_uri + '|' + file_name + ' has no size!', 90)
                // return
                total_download_size += Number(filesize)
                // console.log('Downloading: ' + file_name + ' - ' + helper.bytesToSize(bytes_downloaded) + ' of ' + helper.bytesToSize(total_download_size))
            }
            response.on('data', function(chunk) {
                bytes_downloaded += chunk.length
                if (filesize === undefined) {
                    total_download_size += chunk.length
                }
                // console.log('Progress: ' + file_name + ' - ' + helper.bytesToSize(total_download_size) + ' - ' + helper.bytesToSize(bytes_downloaded) + ' = ' + helper.bytesToSize(total_download_size - bytes_downloaded) )
            })
            response.on('end', function() {
                if (response.statusCode === 200) {
                    console.log('Finished: ' + file_name + ' - ' + helper.bytesToSize(total_download_size) + ' - ' + helper.bytesToSize(bytes_downloaded) + ' = ' + helper.bytesToSize(total_download_size - bytes_downloaded) )
                    decrementProcessCount()
                } else {
                    decrementProcessCount()
                }
                clearTimeout(t)
            })
        })
    )
    .resize(800, 550)
    .append(append_background)
    .drawText(10, 20, 'Okupatsioonide Muuseumi eksponaat #' + exp_nr ,'south')
    .stream(function(err, stdout, stderr) {
        var f = fs.createWriteStream(download_filename)
        var e = fs.createWriteStream(download_filename + '.output.txt')

        stderr.pipe(e)
        stdout.pipe(f)
    })

        // .pipe(resize).stream().pipe(fs.createWriteStream(download_filename))

}
util.inherits(fetchFile, EventEmitter)


var pulse_cnt = 0
var pulse = function pulse(ms) {
    console.log('tick ' + (++pulse_cnt))
    setTimeout(function() { pulse(ms) }, ms)
}
pulse(10 * 1000)



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
docker logs -f --tail=5 puhh
*/

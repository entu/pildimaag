var nomnom          = require('nomnom')
// var http            = require("http");
// var im              = require("imagemagick");

var entulib         = require('./entulib.js')

// console.log(process.argv)
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
console.log(opts)

var EntuLib = entulib(opts.USER_ID, opts.API_KEY, opts.HOSTNAME)
var LIMIT = 10


var fetchNextPage = function fetchNextPage(page) {
    EntuLib.findEntity('eksponaat', '00000', LIMIT, page, function findEntityCB(err, result) {
        if (err) {
            console.log('Can\'t reach Entu', err, result)
            process.exit(99)
        }
        else if (result.error !== undefined) {
            console.log (result.error, 'Failed to fetch from Entu.')
        } else {
            console.log('Fetched ' + result.result.length + '/' + result.count
                + ' results on page ' + page + '/' + Math.ceil(result.count / LIMIT))
            console.log(result.result)

            if (LIMIT * page < result.count) {
                fetchNextPage(page+1)
            } else {
                console.log('Finished.')
                process.exit(0)
                // setTimeout(function() { fetchNextPage(1) }, 1000 * 10 * 1 * 1)
                // setTimeout(function() { fetchNextPage(1) }, 1000 * 60 * 60 * 24)
            }
        }
    })
}

fetchNextPage(1)



var pulse_cnt = 0
var pulse = function pulse(ms) {
    console.log('tick ' + (++pulse_cnt))
    setTimeout(function() { pulse(ms) }, ms)
}
pulse(10 * 1000)

// var server = http.createServer(function(req, res) {

//   var options = {
//     width: 120,
//     height: 80,
//     srcPath: "image.png",
//     dstPath: "output.png"
//   };

//   im.resize(options, function(err) {
//     if(err) { throw err; }
//     res.end("Image resize complete");
//   });

// }).listen(8080);


/*
BUILD
docker kill puhh
docker rm puhh
docker build -t mitselek/pildimaag ~/Documents/github/pildimaag/

CLEAN, RUN and LOG
docker kill puhh
docker rm puhh
docker run -d -v ~/Documents/github/pildimaag/:/pildimaag/ --name puhh mitselek/pildimaag:latest -e 155005 -k 378c2VuY
docker logs -f puhh

RESTART and LOG
docker kill puhh
docker start puhh
docker logs -f puhh

CLEANUP
docker kill puhh
docker rm puhh
*/

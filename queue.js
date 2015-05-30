var util            = require('util')
var EventEmitter    = require('events').EventEmitter

var Queue = function Queue(limit) {
    EventEmitter.call(this)
    var increment = 0
    var queue = []
    var active = 0
    next = function next() {
        if (active < limit && queue.length > 0) {
            var job = queue.shift()
            active ++
            console.log(Date().toString() + ' Start ' + job.name + ' from queue. Active/Queue size ' + active + '/' + queue.length)
            job.job_function(job.job_data, function finalCB(err) {
                if (err) {
                    console.log(err)
                    return
                }
                if (job.finished) {
                    console.log(Date().toString() + ' Cant finish again ' + job.name + ' already finished!')
                    return
                }
                job.finished = true
                active --
                console.log(Date().toString() + ' Finished ' + job.name + '.')
                next()
            })
        } else if (active >= limit) {
            console.log(Date().toString() + ' Active queue full. Active/Queue size ' + active + '/' + queue.length)
        } else if (queue.length === 0) {
            console.log(Date().toString() + ' queue empty...')
        }
    }
    return {
        add: function(name, jobData, jobFunction) {
            increment ++
            queue.push({'id':increment, 'name':name, 'job_data':jobData, 'job_function':jobFunction, 'finished':false})
            console.log(Date().toString() + ' Adding ' + name + ' to queue position ' + queue.length)
            next()
        }
    }
}
util.inherits(Queue, EventEmitter)


module.exports = Queue

//
// Sample usage
//
// console.log('aa')
// var q = new Queue(3)
// for (var i = 1; i <= 15; i++) {
//     var jobData = {
//         'i': i,
//         'message': 'working on ###' + i
//     }
//     q.add(jobData, function jobFunction(jobData, finishCB) {
//         console.log(Date().toString() + ' job ' + jobData['message'] + ' sleeps for ' + jobData['i'] + 's')
//         setTimeout(function() {
//             console.log(Date().toString() + ' job ' + jobData['message'] + ' finished.')
//             finishCB(null)
//         }, jobData['i'] * 1000)
//     })
// }

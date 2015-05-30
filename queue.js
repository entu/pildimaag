// var util            = require('util')
// var EventEmitter    = require('events').EventEmitter

var Queue = function Queue(limit) {
    // EventEmitter.call(this)
    // var self = this
    var increment = 0
    var queue = []
    var active_jobs = {}
    var active = 0
    var status = 'stopped'
    next = function next() {
        if (status === 'stopped') {
            console.log('Queue not started...')
            return
        }
        if (active < limit && queue.length > 0) {
            var job = queue.shift()
            job.started = Date()
            active ++
            active_jobs[job.id] = job
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
                delete active_jobs[job.id]
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
        },
        stats: function() {
            return {active:active, queue:queue.length, jobs:active_jobs}
        },
        start: function() {
            status = 'started'
            next()
        }
    }
}
// util.inherits(Queue, EventEmitter)


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

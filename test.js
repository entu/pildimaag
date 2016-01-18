var entu = require('entulib')

var entuOptions = {
    "entuUrl": "https://devm.entu.ee",
    "user": "155005",
    "key": "changeme"
}

entu.getEntity(entuOptions.user, entuOptions)
.then( function(result) {
    console.log(result.get())
})
.catch( function(err) {
    console.log(err)
})

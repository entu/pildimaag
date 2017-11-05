const fs = require('fs')
const path = require('path')
const async = require('async')
const entu = require('entulib')



fs.readdir('video thumbs', function(err, filenames) {
  if (err) {
    throw err
    return
  }
  let entuOptions = {
    entuUrl: 'https://kogumelugu.entu.ee',
    user: '4',
    key: '',
    relaxBetweenPages: 1
  }
  filenames.forEach(function(filename) {
    let filePath = 'video thumbs/' + filename
    var fileStats = fs.statSync(filePath)
    var fileOptions = {
      'entityId': filename.split('.')[0],
      'property': 'interview-photo',
      'filename': filename,
      'filetype': 'image/jpeg',
      'filesize': fileStats.size,
      'filepath': filePath
    }
    entu.uploadFile(fileOptions, entuOptions)
      .then(function () {
        console.log('uploaded ' + filePath)
        // fs.unlink(filePath)
        return
      })
      .catch(function (err) {
        console.log('Something went wrong with upload', err)
        return
      })
  });
});



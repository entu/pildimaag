function exify (filename, tags, callback) {
  var acceptedTags = [
    'Artist',
    'Comment',
    'DocumentName',
    'ImageDescription',
    'Copyright',
    'ImageNumber'
  ]

  if (!tags) { tags = {} }

  var tagSet = Object.keys(tags).map(function (tag) {
    return { param: tag, value: tags[tag] }
  })
  tagSet = tagSet.filter(function (a) {
    return acceptedTags.indexOf(a.param) > -1
  })
  tagSet.push({ param: 'ProcessingSoftware', value: 'Pildimaag' })
  tagSet.push({ param: 'Software', value: 'Pildimaag' })
  tagSet.push({ param: 'HostComputer', value: 'entu.ee' })
  tagSet.push({ param: 'DateTime', value: new Date().toJSON() })
  var command = tagSet.map(function (tag) {
    if (Number(tag.value) > 0) {
      if (Number(tag.value) >= Math.pow(2, 32)) { return '' }
      return '-' + tag.param + '#=' + tag.value
    }
    return '-' + tag.param + '="' + tag.value + '"'
  })
  command.push('-overwrite_original')
  command.push(filename)

  var exif = require('child_process').spawn('exiftool', command)
  exif.on('error', function (err) {
    callback({ message: 'Fatal Error: Unable to load exiftool.', error: err })
  })

  var response = ''
  exif.stdout.on('data', function (data) { response += data })

  var errorMessage = ''
  exif.stderr.on('data', function (data) { errorMessage += data.toString() })

  exif.on('close', function () {
    if (errorMessage) { return callback(errorMessage) }
    callback(null, response)
  })
}

module.exports = exify

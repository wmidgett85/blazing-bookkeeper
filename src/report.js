import { remote, webFrame, ipcRenderer } from 'electron'
import JSONFormatter from 'json-formatter-js'
import Vue from 'vue'
import jetpack from 'fs-jetpack'
import request from 'request'
import env from './env'
import crashReporter from './helpers/crash_reporter'
import contextMenu from './menu/context_menu'
import externalLinks from './helpers/external_links'

// Initialize
crashReporter(env)
contextMenu()
externalLinks()

webFrame.setZoomLevelLimits(1, 1) // Don't allow any pinch zoom

var appDir = jetpack.cwd(remote.app.getAppPath())

document.addEventListener('DOMContentLoaded', () => {
  global.file = remote.getGlobal('reportFile')
  global.file.anonymized = document.body.querySelector('[name="anonymized"]').checked
  global.file.uploading = false

  new Vue({ // eslint-disable-line no-new
    el: '#main',
    data: {
      file: global.file
    },
    methods: {
      close: close,
      send: send,
      changeAnonymized () {
        if (global.file.uploading) {
          document.body.querySelector('[name="anonymized"]').checked = !!global.file.anonymized
        } else {
          global.file.anonymized = document.body.querySelector('[name="anonymized"]').checked
        }
        render()
      }
    },
    compiled: render
  })

  ipcRenderer.on('report-blur', () => {
    if (!document.body.classList.contains('blurred')) document.body.classList.add('blurred')
  })

  ipcRenderer.on('report-focus', () => {
    if (document.body.classList.contains('blurred')) document.body.classList.remove('blurred')
  })
})

function send () {
  if (global.file.uploading) {
    console.log('Already uploading report.')
    return
  }

  var packageJSON = appDir.read('package.json', 'json')
  var formData = {
    product: packageJSON.productName,
    version: packageJSON.version,
    report_json: JSON.stringify(fileObject()),
    comments: document.querySelector('[name="comments"]').value
  }

  if (!global.file.anonymized) {
    formData.document = jetpack.createReadStream(global.file.file.path)
    formData.email = document.querySelector('[name="email"]').value
  }

  var url = env.bugReportSubmitURL || 'https://localhost:5000/bug-report/upload'
  global.file.uploading = request.post(
    { url: url, formData: formData },
    (error, httpResponse, body) => {
      global.file.uploading = false
      if (error || httpResponse.statusCode !== 200) {
        if (error) {
          console.error('Upload failed:', error)
        } else {
          console.log('Error: ' + httpResponse.statusMessage)
          console.log(body)
        }
        return window.alert('Could not send report. Please check your internet connection, or try again later.')
      }
      console.log('Upload successful!')
      close()
    })
}

function close () { ipcRenderer.send('close-report') }

function fileObject () {
  var fileJSON = {}
  fileJSON = {
    name: global.file.file.name,
    parsed: global.file.result.parsed
  }
  if (global.file.result.error) {
    fileJSON.error = global.file.result.error.json
  }

  if (global.file.anonymized && fileJSON.error) {
    fileJSON.error = JSON.stringify(fileJSON.error)
      .replace(new RegExp(process.cwd(), 'g'), '~')
    fileJSON.error = JSON.parse(fileJSON.error)
  }

  return fileJSON
}

function render () {
  var formatter
  var fileJSON = fileObject()

  var results = document.body.querySelector('.json.results')
  if (results) {
    formatter = new JSONFormatter(fileJSON.parsed, [0], { hoverPreviewEnabled: true, hoverPreviewFieldCount: 0 })
    results.innerHTML = ''
    results.appendChild(formatter.render())
  }

  var fullError = document.body.querySelector('.json.full-error')
  if (fullError) {
    formatter = new JSONFormatter(fileJSON.error, [0], { hoverPreviewEnabled: true, hoverPreviewFieldCount: 0 })
    fullError.innerHTML = ''
    fullError.appendChild(formatter.render())
  }
}

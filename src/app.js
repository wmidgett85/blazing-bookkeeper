import { webFrame, remote, ipcRenderer, clipboard } from 'electron'
import jetpack from 'fs-jetpack'
import Vue from 'vue'
import env from './env'
import { FileList } from './file_list/file_list'
import crashReporter from './helpers/crash_reporter'
import contextMenu from './menu/context_menu'

// Initialize
crashReporter(env)
contextMenu()

webFrame.setZoomLevelLimits(1, 1) // Don't allow any pinch zoom

console.log('Loaded environment variables:', env)

var app = remote.app
var dialog = remote.dialog
var appDir = jetpack.cwd(app.getAppPath())

console.log('The author of this app is:', appDir.read('package.json', 'json').author)

document.addEventListener('DOMContentLoaded', () => {
  global.fileList = new FileList('files')
  var summaryComponent = Vue.extend({})
  var fileListComponent = Vue.extend({})
  var toolbarComponent = Vue.extend({})
  new Vue({ // eslint-disable-line no-new
    el: '#main',
    data: {
      selectedFiles: global.fileList.selectedFiles,
      files: global.fileList.files
    },
    methods: {
      open: openFiles,
      selectAll () { global.fileList.Select.selectAll() },
      deselectAll () { global.fileList.Select.deselectAll() },
      selectUp (event) { global.fileList.Select.moveDirection('up', !event.shiftKey) },
      selectDown (event) { global.fileList.Select.moveDirection('down', !event.shiftKey) },
      handleCmdOrCtrlA (event) {
        if (global.fileList.el() && (event.metaKey || event.ctrlKey) && event.keyCode === 65) {
          event.preventDefault()
          global.fileList.Select.selectAll()
        }
      },
      handleCmdOrCtrlBackspace (event) {
        if (global.fileList.el() && (event.metaKey || event.ctrlKey) && event.keyCode === 8) {
          event.preventDefault()
          document.dispatchEvent(new window.CustomEvent('removeSelected', event))
        }
      },
      edit (event) {
        global.fileList.Select.select([event.currentTarget], true)
        var index = global.fileList.getIndexForElement(event.currentTarget)
        var file = global.fileList.getFileForElement(event.currentTarget)
        if (!file.done) return

        if (file.result.error) {
          file.result.error.json = JSON.parse(JSON.stringify(file.result.error, Object.getOwnPropertyNames(file.result.error)))
        }

        ipcRenderer.send('display-edit', [index, file])
      },
      export: exportCSV,
      select: selectFiles
    },
    computed: {
      exportLabel () {
        if (this.selectedFiles.length > 0) return 'Export ' + this.selectedFiles.length + ' item(s)'
        return 'Export'
      },
      result: global.fileList.results,
      successRateLabel () {
        var total = this.result.done.successful / (this.result.done.total || 1) * 100
        var color = total < 85 ? 'red' : total < 95 ? 'yellow' : 'green'
        return '<span class="color-' + color + '">' + total.toFixed(1) + '%</span>'
      }
    },
    components: {
      'file-list-component': fileListComponent,
      'summary-component': summaryComponent,
      'toolbar-component': toolbarComponent
    }
  })
  handleDragnDrop()

  ipcRenderer.on('edit-updated', (event, arg) => {
    var result = global.fileList.getFileForIndex(arg.index).result
    result.updated = arg.updated
    global.fileList.updateFile(arg.index, { result: result })
  })

  ipcRenderer.on('main-blur', () => {
    if (!document.body.classList.contains('blurred')) document.body.classList.add('blurred')
  })

  ipcRenderer.on('main-focus', () => {
    if (document.body.classList.contains('blurred')) document.body.classList.remove('blurred')
  })

  document.addEventListener('copy', copySelectedToClipboard, true)
  document.addEventListener('removeSelected', removeSelected, true)
})

function selectFiles (event) {
  // If user does shift + click
  if (event.shiftKey) {
    global.fileList.Select.selectUntil(event.currentTarget)
  // If user does command + click
  } else if (event.metaKey || event.ctrlKey) {
    global.fileList.Select.toggleSelect(event.currentTarget)
  } else {
    global.fileList.Select.select([event.currentTarget], true)
  }
}

var openFilesDialog = false
function openFiles () {
  if (openFilesDialog === true) return
  openFilesDialog = true

  dialog.showOpenDialog({
    properties: ['openFile', 'openDirectory', 'multiSelections'],
    filters: [
      { name: 'JPG', extensions: ['jpg', 'jpeg'] },
      { name: 'PNG', extensions: ['png'] },
      { name: 'PDF', extensions: ['pdf'] },
      { name: 'TIFF', extensions: ['tif', 'tiff'] },
      { name: 'BMP', extensions: ['bmp'] }
    ]
  },
    paths => {
      openFilesDialog = false

      if (paths && paths.length) {
        global.fileList.addFiles(paths)
      }
    })
}

var saveFileDialog = false
function exportCSV () {
  if (saveFileDialog === true) return
  saveFileDialog = true

  dialog.showSaveDialog({
    defaultPath: 'results.csv',
    filters: [
      { name: 'CSV', extensions: ['csv'] }
    ]
  }, filename => {
    saveFileDialog = false
    if (filename) jetpack.write(filename, global.fileList.Select.selectedToCSV())
  })
}

function handleDragnDrop () {
  // Drag files
  document.ondragover = document.ondrop = event => event.preventDefault()

  document.body.ondrop = event => {
    if (document.body.classList.contains('drag')) document.body.classList.remove('drag')

    if (event.dataTransfer.files.length) {
      global.fileList.addFiles(event.dataTransfer.files)
    }

    event.preventDefault()
  }

  var dragCounter = 0
  document.body.ondragenter = () => {
    dragCounter++
    if (!document.body.classList.contains('drag')) document.body.classList.add('drag')
  }
  document.body.ondragend = document.body.ondragleave = () => {
    dragCounter--
    if (dragCounter > 0) return
    if (document.body.classList.contains('drag')) document.body.classList.remove('drag')
  }
}

function copySelectedToClipboard () {
  clipboard.writeText(global.fileList.Select.selectedToCSV(), 'text/csv')
}

function removeSelected () {
  global.fileList.Select.removeSelected()
}

const { app, BrowserWindow } = require('electron')
const path = require('node:path')

const DEV_URL = process.env.ELECTRON_START_URL || 'http://localhost:5173'

async function loadWithRetry(win, url, attempts = 30) {
  for (let i = 0; i < attempts; i++) {
    try {
      await win.loadURL(url)
      return
    } catch {
      await new Promise((r) => setTimeout(r, 1000))
    }
  }
  await win.loadURL(url)
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (process.env.ELECTRON_DEV === '1') {
    loadWithRetry(win, DEV_URL)
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

/**
 * Альтернативный загрузчик страницы Циан через Electron.
 *
 * Полезен, если Playwright/Chromium не проходит JS-challenge. Открывается
 * обычное видимое окно Chromium; капчу при необходимости проходит человек.
 * Скрипт не обходит защиту и не подменяет капчу.
 *
 * Запуск (Electron должен быть установлен):
 *   npx electron parser/fetch_cian_electron.cjs
 *
 * Переменные окружения:
 *   CIAN_URL       — адрес страницы (по умолчанию поиск аренды в Новосибирске)
 *   CIAN_OUT       — путь к HTML
 *   CIAN_WAIT_MS   — сколько ждать перед сохранением (по умолчанию 45000)
 */
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const url = process.env.CIAN_URL || 'https://novosibirsk.cian.ru/snyat-kvartiru/'
const out = process.env.CIAN_OUT || 'parser/data/cian-rent.html'
const waitMs = Number(process.env.CIAN_WAIT_MS || 45000)

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 1440,
    height: 1000,
    show: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.loadURL(url)
  console.log(`Открыт ${url}`)
  console.log(
    `Если появилась капча — пройдите её. Через ${Math.round(waitMs / 1000)} с HTML сохранится.`,
  )

  setTimeout(async () => {
    try {
      const html = await win.webContents.executeJavaScript(
        'document.documentElement.outerHTML',
      )
      const target = path.resolve(out)
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, html, 'utf8')
      console.log(`Сохранено: ${target} (${html.length.toLocaleString('ru-RU')} символов)`)
    } catch (error) {
      console.error('Не удалось сохранить страницу:', error)
      process.exitCode = 1
    } finally {
      app.quit()
    }
  }, waitMs)
})

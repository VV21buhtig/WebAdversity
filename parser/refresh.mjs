#!/usr/bin/env node
/**
 * Автоматический сбор данных: браузер → HTML → JSON.
 *
 * Запускается сервером, когда снимок отсутствует/устарел или когда интерфейс
 * попросил загрузить конкретный город. Список городов берётся из
 * parser/data/cities.json — он собирается из встроенного справочника Циан.
 *
 * Переменные окружения:
 *   ELECTRON_BIN=...       путь к Electron, если он не найден автоматически
 *   CIAN_CITY_IDS=4855     загрузить конкретные города по id
 *   CIAN_ALL_CITIES=1      загрузить все города из справочника
 *   CIAN_WAIT_MS=15000     пауза после открытия каждой страницы
 *   CIAN_SKIP_EXISTING=1   не перекачивать уже сохранённые HTML
 *   CIAN_HEADLESS=1        скрыть окно браузера
 */

import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dataDir = path.join(rootDir, 'parser', 'data')
const citiesFile = path.join(dataDir, 'cities.json')

function findElectron() {
  const candidates = [
    process.env.ELECTRON_BIN,
    path.join(rootDir, 'node_modules', '.bin', 'electron'),
    path.join(rootDir, 'node_modules', 'electron', 'dist', 'electron'),
    '/home/ponchik/Documents/projects/TRPO/FastFood projects/desktop/node_modules/.bin/electron',
  ].filter(Boolean)

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

function run(command, args, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    console.log(`$ ${command} ${args.join(' ')}`)
    const child = spawn(command, args, {
      cwd: rootDir,
      env: { ...process.env, ...extraEnv },
      stdio: 'inherit',
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${path.basename(command)} завершился с кодом ${code}`))
    })
  })
}

async function ensureCityDirectory() {
  if (fs.existsSync(citiesFile)) return true
  try {
    await run('python3', ['parser/discover_cities.py'])
    return fs.existsSync(citiesFile)
  } catch (error) {
    console.warn(`[refresh] не удалось собрать справочник городов: ${error.message}`)
    return false
  }
}

async function main() {
  fs.mkdirSync(dataDir, { recursive: true })

  if (!(await ensureCityDirectory())) {
    console.warn(
      '[refresh] справочника городов ещё нет — загружу стартовый город, ' +
        'а список городов соберу из его страницы автоматически',
    )
  }

  const electron = findElectron()
  if (electron) {
    try {
      await run(
        electron,
        ['parser/fetch_cities.cjs', '--no-sandbox', '--disable-gpu'],
        {
          CIAN_WAIT_MS: process.env.CIAN_WAIT_MS || '15000',
          CIAN_SKIP_EXISTING: process.env.CIAN_SKIP_EXISTING || '0',
        },
      )
    } catch (error) {
      // Даже если браузер не смог обновить все страницы, ниже попробуем
      // собрать JSON из уже сохранённых снимков.
      console.warn(`\n[refresh] загрузка страниц не завершилась: ${error.message}`)
    }
  } else {
    console.warn(
      '\n[refresh] Electron не найден. Соберу данные из уже сохранённых HTML.\n' +
        'Для свежего сбора задайте ELECTRON_BIN или установите electron в проект.',
    )
  }

  // Обновим справочник на случай, если Циан добавил новые города.
  try {
    await run('python3', ['parser/discover_cities.py'])
  } catch (error) {
    console.warn(`[refresh] справочник городов не обновлён: ${error.message}`)
  }

  await run('python3', ['parser/build_dataset.py'])
}

main().catch((error) => {
  console.error(`\n[refresh] ошибка: ${error.stack || error.message}`)
  process.exitCode = 1
})

/**
 * Автоматический загрузчик страниц Циан.
 *
 * Города не задаются вручную: справочник parser/data/cities.json собирается
 * из встроенного JSON Циан (parser/discover_cities.py). По умолчанию скрипт
 * обновляет только уже собранные города, а конкретный город можно загрузить
 * через CIAN_CITY_IDS=4855 (Майкоп).
 *
 * Обычно запускается через parser/refresh.mjs — сервер делает это сам.
 *
 * Переменные окружения:
 *   CIAN_CITY_IDS=1,2,4855  загрузить конкретные города по id
 *   CIAN_ALL_CITIES=1       загрузить все города из справочника
 *   CIAN_ONLY=Майкоп,Сочи   загрузить города по названию (для отладки)
 *   CIAN_WAIT_MS=15000      пауза после загрузки каждой страницы
 *   CIAN_SKIP_EXISTING=1    не перекачивать уже сохранённые HTML
 *   CIAN_HEADLESS=1         скрыть окно браузера
 */
const { app, BrowserWindow, session } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const rootDir = path.resolve(__dirname, '..')
const citiesFile = path.resolve(rootDir, 'parser/data/cities.json')
const dataDir = path.resolve(rootDir, 'parser/data')
const SEED_CITY_ID = 4897 // Новосибирск — только для самого первого запуска.

const TYPES = [
  { key: 'flat', label: 'квартиры', offerType: 'flat' },
  { key: 'house', label: 'дома', offerType: 'suburban' },
]

const waitMs = Number(process.env.CIAN_WAIT_MS || 15000)
const baseUrl = 'https://novosibirsk.cian.ru/cat.php'

fs.mkdirSync(dataDir, { recursive: true })

function readCities() {
  if (!fs.existsSync(citiesFile)) return []
  try {
    const parsed = JSON.parse(fs.readFileSync(citiesFile, 'utf8'))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function activeCityIds() {
  const ids = new Set()
  for (const file of fs.readdirSync(dataDir)) {
    const match = /^city-(\d+)-(?:flat|house)\.html$/.exec(file)
    if (match) ids.add(Number(match[1]))
  }
  return [...ids]
}

function selectCities(allCities) {
  const rawIds = String(process.env.CIAN_CITY_IDS || '')
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0)

  if (rawIds.length) {
    const wanted = new Set(rawIds)
    return allCities.filter((city) => wanted.has(Number(city.id)))
  }

  const names = String(process.env.CIAN_ONLY || '')
    .split(',')
    .map((value) => value.trim().toLocaleLowerCase('ru'))
    .filter(Boolean)
  if (names.length) {
    return allCities.filter((city) =>
      names.includes(String(city.name).toLocaleLowerCase('ru')),
    )
  }

  if (process.env.CIAN_ALL_CITIES === '1') return allCities

  const active = new Set(activeCityIds())
  const selected = allCities.filter((city) => active.has(Number(city.id)))
  if (selected.length) return selected

  const seed = allCities.find((city) => Number(city.id) === SEED_CITY_ID)
  return seed ? [seed] : allCities.slice(0, 1)
}

function buildUrl(city, type) {
  // Для московских квартир cat.php с region=1 отдаёт Новосибирск.
  // Рабочий вариант — обычная страница поиска с query-параметром region.
  if (Number(city.id) === 1 && type.key === 'flat') {
    return 'https://www.cian.ru/snyat-kvartiru/?region=1'
  }

  const params = new URLSearchParams({
    deal_type: 'rent',
    engine_version: '2',
    offer_type: type.offerType,
    region: String(city.id),
    type: '4',
  })
  if (type.key === 'house') params.set('object_type[0]', '1')
  return `${baseUrl}?${params.toString()}`
}

const skipExisting = process.env.CIAN_SKIP_EXISTING === '1'
let allCities = readCities()
if (!allCities.length) {
  // Первый запуск без справочника: загружаем стартовый город, а refresh.mjs
  // после этого соберёт полный список городов из его встроенного JSON Циан.
  console.warn(
    'Нет parser/data/cities.json — начинаю со стартового города и ' +
      'соберу справочник автоматически.',
  )
  allCities = [{ id: SEED_CITY_ID, name: 'Новосибирск' }]
}
const cities = selectCities(allCities)

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1440,
    height: 1000,
    show: process.env.CIAN_HEADLESS !== '1',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  console.log(`Городов в справочнике: ${allCities.length}; к загрузке: ${cities.length}`)

  for (const city of cities) {
    for (const type of TYPES) {
      const url = buildUrl(city, type)
      const output = path.resolve(dataDir, `city-${city.id}-${type.key}.html`)

      if (skipExisting && fs.existsSync(output)) {
        console.log(`SKIP ${output}`)
        continue
      }

      console.log(`FETCH ${city.name} / ${type.label}: ${url}`)
      try {
        await session.defaultSession.cookies.set({
          url: 'https://cian.ru',
          name: 'session_region_id',
          value: String(city.id),
        })
        await win.loadURL(url).catch((error) => {
          // Cian может пытаться открыть внешний OAuth-виджет; основная
          // страница при этом загружается нормально.
          console.warn(`  load warning: ${error.message}`)
        })
        await new Promise((resolve) => setTimeout(resolve, waitMs))

        const info = await win.webContents.executeJavaScript(`(() => ({
          title: document.title,
          url: location.href,
          cards: document.querySelectorAll('article').length,
          captcha: /captcha|подтвердите|robot/i.test(document.body.innerText)
        }))()`)
        const html = await win.webContents.executeJavaScript(
          'document.documentElement.outerHTML',
        )
        fs.mkdirSync(path.dirname(output), { recursive: true })
        fs.writeFileSync(output, html, 'utf8')
        console.log(
          `SAVED ${output} | cards=${info.cards} | captcha=${info.captcha} | ${info.url} | ${info.title.slice(0, 70)}`,
        )
      } catch (error) {
        console.error(`FAILED ${city.name} / ${type.label}:`, error)
      }
    }
  }

  app.quit()
})

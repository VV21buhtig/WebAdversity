import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import express from 'express'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const dbPath = process.env.DB_PATH || path.join(__dirname, 'data', 'app.db')
const port = Number(process.env.PORT || 3001)
const listingsFile = path.join(rootDir, 'src', 'data', 'listings.json')
const citiesFile = path.join(rootDir, 'parser', 'data', 'cities.json')
const parserDataDir = path.join(rootDir, 'parser', 'data')
const refreshScript = path.join(rootDir, 'parser', 'refresh.mjs')
const refreshTtlMs = Number(process.env.CIAN_REFRESH_TTL_MS || 6 * 60 * 60 * 1000)
const cityTtlHours = Number(process.env.CIAN_CITY_TTL_HOURS)
const cityTtlFromHours =
  Number.isFinite(cityTtlHours) && cityTtlHours > 0 ? cityTtlHours * 60 * 60 * 1000 : null
const cityTtlFromMs = Number(process.env.CIAN_CITY_TTL_MS)
const cityTtlMs =
  cityTtlFromHours ||
  (Number.isFinite(cityTtlFromMs) && cityTtlFromMs > 0 ? cityTtlFromMs : refreshTtlMs)
const autoRefresh = process.env.CIAN_AUTO_REFRESH !== '0'
const MIN_MONTHLY_RENT = 3000

fs.mkdirSync(path.dirname(dbPath), { recursive: true })
const db = new DatabaseSync(dbPath)

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS favorites (
    user_id INTEGER NOT NULL,
    listing_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, listing_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS viewed (
    user_id INTEGER NOT NULL,
    listing_id TEXT NOT NULL,
    viewed_at TEXT NOT NULL,
    PRIMARY KEY (user_id, listing_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_viewed_user_time ON viewed(user_id, viewed_at DESC);
`)

const app = express()
app.use(express.json({ limit: '200kb' }))

const now = () => new Date().toISOString()

const refreshState = {
  status: 'idle',
  startedAt: null,
  finishedAt: null,
  error: null,
  listings: 0,
  target: 'active',
  cityName: null,
  logTail: [],
}

let refreshProcess = null

function sanitizeListing(item) {
  if (!item || typeof item !== 'object') return item
  const price = Number(item.price)
  if (!Number.isFinite(price) || price <= 0 || price < MIN_MONTHLY_RENT) {
    return { ...item, price: null, priceLabel: '' }
  }
  return item
}

function readListings() {
  try {
    const parsed = JSON.parse(fs.readFileSync(listingsFile, 'utf8'))
    return Array.isArray(parsed) ? parsed.map(sanitizeListing) : []
  } catch {
    return []
  }
}

function readCities() {
  try {
    const parsed = JSON.parse(fs.readFileSync(citiesFile, 'utf8'))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function datasetInfo() {
  const listings = readListings()
  let updatedAt = null
  try {
    updatedAt = fs.statSync(listingsFile).mtime.toISOString()
  } catch {
    updatedAt = null
  }
  const ageMs = updatedAt ? Date.now() - new Date(updatedAt).getTime() : Infinity
  return {
    listings,
    updatedAt,
    ageMs,
    stale: !updatedAt || ageMs > refreshTtlMs,
  }
}

function cityFreshness(city) {
  const cityId = Number(city?.id)
  if (!Number.isInteger(cityId) || cityId <= 0) {
    return { updatedAt: null, ageMs: null, stale: true, files: 0 }
  }

  const mtimes = ['flat', 'house'].flatMap((type) => {
    try {
      return [fs.statSync(path.join(parserDataDir, `city-${cityId}-${type}.html`)).mtimeMs]
    } catch {
      return []
    }
  })

  if (!mtimes.length) {
    return { updatedAt: null, ageMs: null, stale: true, files: 0 }
  }

  // Берём самый старый из сохранённых типов: если дома обновлялись 10 часов
  // назад, город всё равно надо обновить, даже если квартиры свежие.
  const updatedMs = Math.min(...mtimes)
  const ageMs = Date.now() - updatedMs
  return {
    updatedAt: new Date(updatedMs).toISOString(),
    ageMs,
    stale: ageMs > cityTtlMs,
    files: mtimes.length,
  }
}

function appendRefreshLog(chunk) {
  const lines = String(chunk)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  if (!lines.length) return
  refreshState.logTail = [...refreshState.logTail, ...lines].slice(-80)
  for (const line of lines) console.log(`[refresh] ${line}`)
}

function startRefresh(force = false, options = {}) {
  if (refreshProcess) return false
  if (!force && !datasetInfo().stale) return false
  if (!fs.existsSync(refreshScript)) {
    refreshState.status = 'error'
    refreshState.error = `Не найден ${refreshScript}`
    return false
  }

  const cityIds = Array.isArray(options.cityIds)
    ? options.cityIds.map(Number).filter((value) => Number.isInteger(value) && value > 0)
    : []
  const allCities = options.allCities === true

  refreshState.status = 'running'
  refreshState.startedAt = now()
  refreshState.finishedAt = null
  refreshState.error = null
  refreshState.target = allCities
    ? 'all'
    : cityIds.length
      ? cityIds.join(',')
      : 'active'
  refreshState.cityName = options.cityName || null
  refreshState.logTail = []

  console.log(
    `[refresh] запускаю сбор: ${allCities ? 'все города' : cityIds.length ? `города ${cityIds.join(',')}` : 'активные города'}`,
  )
  const child = spawn(process.execPath, [refreshScript], {
    cwd: rootDir,
    env: {
      ...process.env,
      CIAN_WAIT_MS: process.env.CIAN_WAIT_MS || '15000',
      ...(allCities ? { CIAN_ALL_CITIES: '1' } : {}),
      ...(cityIds.length ? { CIAN_CITY_IDS: cityIds.join(',') } : {}),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  refreshProcess = child

  child.stdout.on('data', appendRefreshLog)
  child.stderr.on('data', appendRefreshLog)

  child.on('error', (error) => {
    refreshState.status = 'error'
    refreshState.error = error.message
    refreshState.finishedAt = now()
    refreshProcess = null
    console.error('[refresh] не удалось запустить сборщик:', error)
  })

  child.on('close', (code) => {
    refreshProcess = null
    refreshState.finishedAt = now()
    if (code === 0) {
      refreshState.status = 'done'
      refreshState.listings = readListings().length
      console.log(`[refresh] готово, объявлений: ${refreshState.listings}`)
    } else {
      refreshState.status = 'error'
      refreshState.error = `Сборщик завершился с кодом ${code}`
      console.error(`[refresh] ${refreshState.error}`)
    }
  })

  return true
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase()
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(':')
  if (!salt || !hash) return false
  const expected = Buffer.from(hash, 'hex')
  const actual = crypto.scryptSync(password, salt, 64)
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual)
}

function publicUser(row) {
  return { id: row.id, name: row.name, email: row.email }
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex')
  db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)').run(
    token,
    userId,
    now(),
  )
  return token
}

function authRequired(req, res, next) {
  const header = String(req.headers.authorization || '')
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!token) {
    return res.status(401).json({ error: 'Нужно войти в аккаунт' })
  }

  const row = db
    .prepare(
      `SELECT u.id, u.name, u.email
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = ?`,
    )
    .get(token)

  if (!row) {
    return res.status(401).json({ error: 'Сессия истекла, войдите заново' })
  }

  req.user = publicUser(row)
  req.token = token
  next()
}

function favoriteIds(userId) {
  return db
    .prepare('SELECT listing_id FROM favorites WHERE user_id = ? ORDER BY created_at DESC')
    .all(userId)
    .map((row) => row.listing_id)
}

function viewedIds(userId) {
  return db
    .prepare('SELECT listing_id FROM viewed WHERE user_id = ? ORDER BY viewed_at DESC LIMIT 200')
    .all(userId)
    .map((row) => row.listing_id)
}

function cleanListingId(value) {
  return String(value || '').trim().slice(0, 100)
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    users: db.prepare('SELECT COUNT(*) AS count FROM users').get().count,
    listings: readListings().length,
    refresh: refreshState.status,
    cityTtlMs,
  })
})

app.get('/api/cities', (req, res) => {
  const query = String(req.query.q || '').trim().toLocaleLowerCase('ru')
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100)
  const cities = readCities()
  const loadedCities = new Set(
    readListings()
      .map((item) => item.city)
      .filter(Boolean),
  )
  const matches = (query
    ? cities.filter((city) => String(city.name).toLocaleLowerCase('ru').includes(query))
    : cities
  )
    .slice(0, limit)
    .map((city) => ({
      ...city,
      loaded: loadedCities.has(city.name),
      freshness: cityFreshness(city),
    }))
  res.json({ cities: matches, total: cities.length, cityTtlMs })
})

app.post('/api/listings/ensure-city', (req, res) => {
  const cityId = Number(req.body?.cityId)
  const cityName = String(req.body?.cityName || '').trim().toLocaleLowerCase('ru')
  const city = readCities().find((item) =>
    cityId
      ? Number(item.id) === cityId
      : String(item.name || '').toLocaleLowerCase('ru') === cityName,
  )

  if (!city) {
    return res.status(404).json({ error: 'Город не найден в справочнике Циан' })
  }

  const alreadyLoaded = readListings().some((item) => item.city === city.name)
  const freshness = cityFreshness(city)
  const force = req.body?.force === true

  if (alreadyLoaded && !force && !freshness.stale) {
    return res.json({
      already: true,
      started: false,
      city,
      freshness,
      refresh: refreshState,
    })
  }

  if (refreshProcess) {
    return res.status(202).json({
      already: false,
      started: false,
      busy: true,
      city,
      freshness,
      refresh: refreshState,
    })
  }

  const started = startRefresh(true, { cityIds: [city.id], cityName: city.name })
  res.status(started ? 202 : 200).json({
    already: false,
    started,
    busy: !started,
    city,
    freshness,
    refresh: refreshState,
  })
})

app.get('/api/listings', (_req, res) => {
  const info = datasetInfo()
  res.json({
    listings: info.listings,
    updatedAt: info.updatedAt,
    stale: info.stale,
    refresh: refreshState,
  })
})

app.get('/api/listings/status', (_req, res) => {
  const info = datasetInfo()
  res.json({
    count: info.listings.length,
    updatedAt: info.updatedAt,
    stale: info.stale,
    refresh: refreshState,
  })
})

app.post('/api/listings/refresh', (req, res) => {
  const force = req.body?.force === true
  const allCities = req.body?.allCities === true
  const started = startRefresh(force, { allCities })
  res.status(started ? 202 : 200).json({
    started,
    refresh: refreshState,
  })
})

app.post('/api/auth/register', (req, res) => {
  const name = String(req.body?.name || '').trim()
  const email = normalizeEmail(req.body?.email)
  const password = String(req.body?.password || '')

  if (name.length < 2) {
    return res.status(400).json({ error: 'Имя должно быть не короче 2 символов' })
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Введите корректный email' })
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Пароль должен быть не короче 6 символов' })
  }
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) {
    return res.status(409).json({ error: 'Пользователь с таким email уже зарегистрирован' })
  }

  const result = db
    .prepare(
      'INSERT INTO users (name, email, password_hash, created_at) VALUES (?, ?, ?, ?)',
    )
    .run(name, email, hashPassword(password), now())

  const userId = Number(result.lastInsertRowid)
  const token = createSession(userId)
  res.status(201).json({
    token,
    user: { id: userId, name, email },
    favorites: [],
    viewed: [],
  })
})

app.post('/api/auth/login', (req, res) => {
  const email = normalizeEmail(req.body?.email)
  const password = String(req.body?.password || '')
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email)

  if (!row || !verifyPassword(password, row.password_hash)) {
    return res.status(401).json({ error: 'Неверный email или пароль' })
  }

  const token = createSession(row.id)
  res.json({
    token,
    user: publicUser(row),
    favorites: favoriteIds(row.id),
    viewed: viewedIds(row.id),
  })
})

app.post('/api/auth/logout', authRequired, (req, res) => {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(req.token)
  res.json({ ok: true })
})

app.get('/api/auth/me', authRequired, (req, res) => {
  res.json({ user: req.user })
})

app.get('/api/me/favorites', authRequired, (req, res) => {
  res.json({ ids: favoriteIds(req.user.id) })
})

app.put('/api/me/favorites/:listingId', authRequired, (req, res) => {
  const listingId = cleanListingId(req.params.listingId)
  if (!listingId) return res.status(400).json({ error: 'Некорректный id объявления' })
  db.prepare(
    `INSERT INTO favorites (user_id, listing_id, created_at)
     VALUES (?, ?, ?)
     ON CONFLICT(user_id, listing_id) DO NOTHING`,
  ).run(req.user.id, listingId, now())
  res.json({ ids: favoriteIds(req.user.id) })
})

app.delete('/api/me/favorites/:listingId', authRequired, (req, res) => {
  const listingId = cleanListingId(req.params.listingId)
  db.prepare('DELETE FROM favorites WHERE user_id = ? AND listing_id = ?').run(
    req.user.id,
    listingId,
  )
  res.json({ ids: favoriteIds(req.user.id) })
})

app.post('/api/me/favorites/merge', authRequired, (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.slice(0, 500) : []
  const insert = db.prepare(
    `INSERT INTO favorites (user_id, listing_id, created_at)
     VALUES (?, ?, ?)
     ON CONFLICT(user_id, listing_id) DO NOTHING`,
  )
  for (const value of ids) {
    const listingId = cleanListingId(value)
    if (listingId) insert.run(req.user.id, listingId, now())
  }
  res.json({ ids: favoriteIds(req.user.id) })
})

app.get('/api/me/viewed', authRequired, (req, res) => {
  res.json({ ids: viewedIds(req.user.id) })
})

app.post('/api/me/viewed/merge', authRequired, (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.slice(0, 200) : []
  const insert = db.prepare(
    `INSERT INTO viewed (user_id, listing_id, viewed_at)
     VALUES (?, ?, ?)
     ON CONFLICT(user_id, listing_id) DO UPDATE SET viewed_at = excluded.viewed_at`,
  )
  const base = Date.now()
  ids.forEach((value, index) => {
    const listingId = cleanListingId(value)
    if (listingId) {
      insert.run(
        req.user.id,
        listingId,
        new Date(base - index * 1000).toISOString(),
      )
    }
  })
  res.json({ ids: viewedIds(req.user.id) })
})

app.post('/api/me/viewed/:listingId', authRequired, (req, res) => {
  const listingId = cleanListingId(req.params.listingId)
  if (!listingId) return res.status(400).json({ error: 'Некорректный id объявления' })
  db.prepare(
    `INSERT INTO viewed (user_id, listing_id, viewed_at)
     VALUES (?, ?, ?)
     ON CONFLICT(user_id, listing_id) DO UPDATE SET viewed_at = excluded.viewed_at`,
  ).run(req.user.id, listingId, now())
  res.json({ ids: viewedIds(req.user.id) })
})

app.delete('/api/me/viewed', authRequired, (req, res) => {
  db.prepare('DELETE FROM viewed WHERE user_id = ?').run(req.user.id)
  res.json({ ids: [] })
})

app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Метод API не найден' })
  }
  next()
})

const distDir = path.join(rootDir, 'dist')
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir))
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next()
    res.sendFile(path.join(distDir, 'index.html'))
  })
}

app.use((error, _req, res, _next) => {
  console.error(error)
  res.status(500).json({ error: 'Внутренняя ошибка сервера' })
})

if (autoRefresh && datasetInfo().stale) {
  startRefresh()
}

const server = app.listen(port, () => {
  console.log(`API: http://127.0.0.1:${port}/api`)
  console.log(`DB:  ${dbPath}`)
  console.log(`Данные: ${listingsFile}`)
  if (autoRefresh) {
    console.log(`Автообновление: ${refreshState.status === 'running' ? 'собираю' : 'данные свежие'}`)
  } else {
    console.log('Автообновление отключено (CIAN_AUTO_REFRESH=0)')
  }
})

function shutdown() {
  server.close(() => {
    db.close()
    process.exit(0)
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

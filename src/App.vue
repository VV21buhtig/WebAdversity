<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import ListingCard from './components/ListingCard.vue'
import ListingDetails from './components/ListingDetails.vue'
import EmptyState from './components/EmptyState.vue'
import AuthModal from './components/AuthModal.vue'
import { pluralize } from './utils/format'
import { api, getStoredToken, setStoredToken } from './api'

const FAVORITES_KEY = 'dom-ryadom-favorites'
const VIEWED_KEY = 'dom-ryadom-viewed'
let fallbackListings = []
const listings = ref([])
const dataState = ref('loading')
const dataError = ref('')
const dataUpdatedAt = ref('')
const refreshStatus = ref('idle')
const ensuringCity = ref(null)
const pendingCity = ref(null)
const pendingCityRefresh = ref(false)
let pollTimer = null
let cityLookupTimer = null
let searchFeedbackTimer = null
let cityLoadAttempts = 0
let refreshRequested = false

const search = ref('')
const searchBusy = ref(false)
const searchFeedback = ref(false)
const minPrice = ref('')
const maxPrice = ref('')
const selectedRooms = ref([])
const selectedDistrict = ref('')
const selectedCity = ref('')
const propertyType = ref('all')
const sortBy = ref('default')
const viewMode = ref('all')
const selectedListing = ref(null)

const favorites = ref(loadStoredSet(FAVORITES_KEY))
const viewedIds = ref(loadStoredArray(VIEWED_KEY))

const user = ref(null)
const userMenuOpen = ref(false)
const authOpen = ref(false)
const authMode = ref('login')
const authBusy = ref(false)
const authError = ref('')

function loadStoredSet(key) {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || '[]')
    return new Set(Array.isArray(raw) ? raw.map(String) : [])
  } catch {
    return new Set()
  }
}

function loadStoredArray(key) {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || '[]')
    return Array.isArray(raw) ? raw.map(String) : []
  } catch {
    return []
  }
}

watch(favorites, (value) => {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify([...value]))
})

watch(viewedIds, (value) => {
  localStorage.setItem(VIEWED_KEY, JSON.stringify(value))
})

const roomOptions = computed(() => {
  const options = []
  if (propertyType.value !== 'house') options.push({ value: 0, label: 'Студия' })
  options.push(
    { value: 1, label: '1' },
    { value: 2, label: '2' },
    { value: 3, label: '3' },
    { value: '4+', label: '4+' },
  )
  return options
})

const quickFilters = [
  { key: 'studios', label: 'Студии' },
  { key: 'one-room', label: '1-комнатные' },
  { key: 'houses', label: 'Дома' },
  { key: 'budget', label: 'До 30 000 ₽' },
]

const activeQuickFilter = computed(() => {
  if (
    propertyType.value === 'flat' &&
    selectedRooms.value.length === 1 &&
    selectedRooms.value[0] === 0 &&
    minPrice.value === '' &&
    maxPrice.value === ''
  ) {
    return 'studios'
  }
  if (
    propertyType.value === 'flat' &&
    selectedRooms.value.length === 1 &&
    selectedRooms.value[0] === 1 &&
    minPrice.value === '' &&
    maxPrice.value === ''
  ) {
    return 'one-room'
  }
  if (
    propertyType.value === 'house' &&
    !selectedRooms.value.length &&
    minPrice.value === '' &&
    maxPrice.value === ''
  ) {
    return 'houses'
  }
  if (
    propertyType.value === 'all' &&
    !selectedRooms.value.length &&
    minPrice.value === '' &&
    maxPrice.value === '30000'
  ) {
    return 'budget'
  }
  return ''
})

function applyQuickFilter(key) {
  viewMode.value = 'all'
  userMenuOpen.value = false
  selectedRooms.value = []
  selectedDistrict.value = ''
  minPrice.value = ''
  maxPrice.value = ''
  propertyType.value = 'all'

  if (key === 'studios') {
    propertyType.value = 'flat'
    selectedRooms.value = [0]
  } else if (key === 'one-room') {
    propertyType.value = 'flat'
    selectedRooms.value = [1]
  } else if (key === 'houses') {
    propertyType.value = 'house'
  } else if (key === 'budget') {
    maxPrice.value = '30000'
  }
}

const cities = computed(() => {
  const map = new Map()
  for (const item of listings.value) {
    const name = item.city || 'Другой город'
    const entry = map.get(name) || { name, count: 0, flats: 0, houses: 0 }
    entry.count += 1
    if (item.propertyType === 'house') entry.houses += 1
    else entry.flats += 1
    map.set(name, entry)
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru'))
})

const locationListings = computed(() =>
  listings.value.filter(
    (item) =>
      (!selectedCity.value || item.city === selectedCity.value) &&
      (propertyType.value === 'all' || item.propertyType === propertyType.value),
  ),
)

const districts = computed(() =>
  [...new Set(locationListings.value.map((item) => item.district).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b, 'ru'),
  ),
)

const priceBounds = computed(() => {
  const prices = listings.value
    .map((item) => Number(item.price))
    .filter((value) => Number.isFinite(value) && value > 0)
  return {
    min: prices.length ? Math.min(...prices) : null,
    max: prices.length ? Math.max(...prices) : null,
  }
})

const minPriceLabel = computed(() =>
  priceBounds.value.min
    ? new Intl.NumberFormat('ru-RU').format(priceBounds.value.min) + ' ₽'
    : '—',
)

const normalizedSearch = computed(() => search.value.trim().toLocaleLowerCase('ru'))

const byId = computed(() => new Map(listings.value.map((item) => [String(item.id), item])))

const viewedListings = computed(() =>
  viewedIds.value
    .map((id) => byId.value.get(String(id)))
    .filter(Boolean),
)

const filteredListings = computed(() => {
  let source = listings.value
  if (viewMode.value === 'favorites') {
    source = source.filter((item) => favorites.value.has(String(item.id)))
  } else if (viewMode.value === 'viewed') {
    source = viewedListings.value
  }

  const result = source.filter((item) => {
    if (selectedCity.value && item.city !== selectedCity.value) return false
    if (propertyType.value !== 'all' && item.propertyType !== propertyType.value) {
      return false
    }

    if (normalizedSearch.value) {
      const haystack = [
        item.title,
        item.subtitle,
        item.city,
        item.district,
        item.metro,
        item.address,
        item.description,
      ]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('ru')
      if (!haystack.includes(normalizedSearch.value)) return false
    }

    const price = Number(item.price)
    const priceFilterActive = minPrice.value !== '' || maxPrice.value !== ''
    if (priceFilterActive && !Number.isFinite(price)) return false
    if (minPrice.value !== '' && price < Number(minPrice.value)) return false
    if (maxPrice.value !== '' && price > Number(maxPrice.value)) return false

    if (selectedRooms.value.length) {
      const matches = selectedRooms.value.some((rooms) =>
        rooms === '4+'
          ? Number(item.rooms) >= 4
          : Number(item.rooms) === Number(rooms),
      )
      if (!matches) return false
    }

    if (selectedDistrict.value && item.district !== selectedDistrict.value) {
      return false
    }

    return true
  })

  if (sortBy.value === 'price-asc') {
    return [...result].sort((a, b) => sortablePrice(a) - sortablePrice(b))
  }
  if (sortBy.value === 'price-desc') {
    return [...result].sort((a, b) => sortablePrice(b) - sortablePrice(a))
  }
  if (sortBy.value === 'area-desc') {
    return [...result].sort((a, b) => (b.area || 0) - (a.area || 0))
  }
  return result
})

function sortablePrice(item) {
  const value = Number(item.price)
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER
}

const resultsLabel = computed(() =>
  pluralize(filteredListings.value.length, ['объявление', 'объявления', 'объявлений']),
)

const favoritesCount = computed(() => favorites.value.size)
const viewedCount = computed(() => viewedIds.value.length)
const selectedIsFavorite = computed(() =>
  selectedListing.value ? favorites.value.has(String(selectedListing.value.id)) : false,
)

const activeFilters = computed(
  () =>
    Boolean(search.value.trim()) ||
    minPrice.value !== '' ||
    maxPrice.value !== '' ||
    selectedRooms.value.length > 0 ||
    Boolean(selectedDistrict.value) ||
    Boolean(selectedCity.value) ||
    propertyType.value !== 'all' ||
    sortBy.value !== 'default' ||
    viewMode.value !== 'all',
)

const initials = computed(() =>
  (user.value?.name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase(),
)

const lastUpdatedLabel = computed(() => {
  if (!dataUpdatedAt.value) return ''
  const date = new Date(dataUpdatedAt.value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
})

const cityLoadVerb = computed(() => (pendingCityRefresh.value ? 'Обновляю' : 'Загружаю'))

const dataStatusText = computed(() => {
  if (ensuringCity.value) {
    return `${cityLoadVerb.value} ${ensuringCity.value.name} с Циан — это может занять минуту`
  }
  if (refreshStatus.value === 'running') {
    return refreshStateLabel.value
      ? `${cityLoadVerb.value} ${refreshStateLabel.value} с Циан`
      : listings.value.length
        ? 'Обновляю объявления с Циан в фоне'
        : 'Собираю объявления с Циан — это может занять пару минут'
  }
  if (dataState.value === 'loading') return 'Загружаю объявления…'
  if (dataError.value) return dataError.value
  if (refreshStatus.value === 'error') return 'Не удалось обновить данные, показываю последний снимок'
  if (lastUpdatedLabel.value) return `Данные обновлены ${lastUpdatedLabel.value}`
  return 'Данные загружены'
})

const refreshStateLabel = computed(() => pendingCity.value?.name || '')

const dataStatusTone = computed(() => {
  if (
    ensuringCity.value ||
    refreshStatus.value === 'running' ||
    dataState.value === 'loading'
  ) {
    return 'busy'
  }
  if (refreshStatus.value === 'error' || dataError.value) return 'warn'
  return 'ready'
})

function scheduleListingsPoll() {
  if (pollTimer) clearTimeout(pollTimer)
  if (refreshStatus.value === 'running' || dataState.value === 'loading') {
    pollTimer = setTimeout(loadListings, 2500)
  }
}

async function loadFallbackListings() {
  if (fallbackListings.length) return fallbackListings
  try {
    const module = await import('./data/listings.json')
    fallbackListings = Array.isArray(module.default) ? module.default : []
  } catch {
    fallbackListings = []
  }
  return fallbackListings
}

async function lookupCity(query) {
  const normalized = query.trim().toLocaleLowerCase('ru')
  if (!normalized) return null

  const data = await api.cities(normalized, 5)
  const matches = Array.isArray(data.cities) ? data.cities : []
  const city = matches.find(
    (item) => String(item.name || '').toLocaleLowerCase('ru') === normalized,
  )
  if (!city) return null

  return {
    city,
    loaded: cities.value.some((item) => item.name === city.name),
    stale: Boolean(city.freshness?.stale),
  }
}

function pulseSearch() {
  searchFeedback.value = false
  setTimeout(() => {
    searchFeedback.value = true
  }, 10)
  if (searchFeedbackTimer) clearTimeout(searchFeedbackTimer)
  searchFeedbackTimer = setTimeout(() => {
    searchFeedback.value = false
  }, 500)
}

function scrollToResults() {
  requestAnimationFrame(() => {
    document
      .querySelector('.results-toolbar')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
}

async function submitSearch() {
  pulseSearch()
  const query = search.value.trim()
  if (!query) return

  searchBusy.value = true
  try {
    const found = await lookupCity(query)
    if (found) {
      if (selectedCity.value && selectedCity.value !== found.city.name) {
        selectedCity.value = ''
        selectedDistrict.value = ''
      }
      if (found.loaded) {
        selectedCity.value = found.city.name
        selectedDistrict.value = ''
      }
      await ensureCityData(found.city)
      scrollToResults()
    } else {
      scrollToResults()
    }
  } catch (error) {
    dataError.value = error.message || 'Не удалось выполнить поиск'
  } finally {
    searchBusy.value = false
  }
}

async function ensureCityData(city, { retry = false } = {}) {
  if (!city || ensuringCity.value?.id === city.id) return
  ensuringCity.value = city
  pendingCity.value = city
  pendingCityRefresh.value = cities.value.some((item) => item.name === city.name)
  if (!retry) cityLoadAttempts = 0
  dataError.value = ''
  try {
    const result = await api.ensureCity(city)
    if (result.already && !result.started) {
      ensuringCity.value = null
      await loadListings()
      return
    }
    refreshStatus.value = result.refresh?.status || 'running'
    scheduleListingsPoll()
  } catch (error) {
    pendingCity.value = null
    pendingCityRefresh.value = false
    ensuringCity.value = null
    dataError.value = error.message || `Не удалось загрузить ${city.name}`
  }
}

async function loadListings() {
  if (pollTimer) {
    clearTimeout(pollTimer)
    pollTimer = null
  }
  try {
    const data = await api.listings()
    const remote = Array.isArray(data.listings) ? data.listings : []
    listings.value = remote
    dataUpdatedAt.value = data.updatedAt || ''
    refreshStatus.value = data.refresh?.status || 'idle'
    dataError.value = ''
    dataState.value = listings.value.length
      ? 'ready'
      : refreshStatus.value === 'running'
        ? 'loading'
        : 'empty'

    if (data.stale && refreshStatus.value !== 'running' && !refreshRequested) {
      refreshRequested = true
      const result = await api.refreshListings()
      refreshStatus.value = result.refresh?.status || refreshStatus.value
    }

    if (pendingCity.value) {
      const city = pendingCity.value
      const loaded = listings.value.some((item) => item.city === city.name)
      if (loaded) {
        if (pendingCityRefresh.value && refreshStatus.value === 'running') {
          // Ждём, пока обновится уже существующий город.
        } else {
          pendingCity.value = null
          pendingCityRefresh.value = false
          ensuringCity.value = null
          cityLoadAttempts = 0
          selectedCity.value = city.name
          selectedDistrict.value = ''
        }
      } else if (refreshStatus.value === 'done' && cityLoadAttempts < 2) {
        cityLoadAttempts += 1
        await ensureCityData(city, { retry: true })
      } else if (
        refreshStatus.value === 'error' ||
        (refreshStatus.value === 'done' && cityLoadAttempts >= 2)
      ) {
        pendingCity.value = null
        pendingCityRefresh.value = false
        ensuringCity.value = null
        dataError.value = `Не удалось загрузить ${city.name}`
      }
    }

    if (refreshStatus.value === 'done') refreshRequested = false
    scheduleListingsPoll()
  } catch (error) {
    const fallback = await loadFallbackListings()
    listings.value = fallback
    dataError.value = 'Сервер данных недоступен. Показываю последний сохранённый снимок.'
    dataState.value = fallback.length ? 'ready' : 'error'
    if (!fallback.length) dataError.value = error.message || dataError.value
  }
}

async function manualRefresh() {
  try {
    const result = await api.refreshListings(true)
    refreshStatus.value = result.refresh?.status || 'running'
    refreshRequested = true
    dataError.value = ''
    scheduleListingsPoll()
  } catch (error) {
    dataError.value = error.message || 'Не удалось запустить обновление'
  }
}

function toggleRoom(value) {
  selectedRooms.value = selectedRooms.value.includes(value)
    ? selectedRooms.value.filter((room) => room !== value)
    : [...selectedRooms.value, value]
}

function toggleFavorite(id) {
  const key = String(id)
  const next = new Set(favorites.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  favorites.value = next

  if (user.value) {
    const request = next.has(key) ? api.addFavorite(key) : api.removeFavorite(key)
    request
      .then((data) => {
        if (Array.isArray(data?.ids)) favorites.value = new Set(data.ids)
      })
      .catch(() => {})
  }
}

function recordViewed(id) {
  const key = String(id)
  viewedIds.value = [key, ...viewedIds.value.filter((item) => item !== key)].slice(0, 100)
  if (user.value) {
    api
      .markViewed(key)
      .then((data) => {
        if (Array.isArray(data?.ids)) viewedIds.value = data.ids
      })
      .catch(() => {})
  }
}

function openListing(listing) {
  selectedListing.value = listing
  recordViewed(listing.id)
}

function closeDetails() {
  selectedListing.value = null
}

function resetFilters() {
  search.value = ''
  minPrice.value = ''
  maxPrice.value = ''
  selectedRooms.value = []
  selectedDistrict.value = ''
  selectedCity.value = ''
  propertyType.value = 'all'
  sortBy.value = 'default'
  viewMode.value = 'all'
}

function showAll() {
  viewMode.value = 'all'
  userMenuOpen.value = false
}

function showFavorites() {
  viewMode.value = 'favorites'
  userMenuOpen.value = false
}

function showViewed() {
  viewMode.value = 'viewed'
  userMenuOpen.value = false
}

function clearViewed() {
  viewedIds.value = []
  if (user.value) api.clearViewed().catch(() => {})
}

function openAuth(mode = 'login') {
  authMode.value = mode
  authError.value = ''
  authOpen.value = true
  userMenuOpen.value = false
}

function closeAuth() {
  if (!authBusy.value) authOpen.value = false
}

function switchAuth(mode) {
  authMode.value = mode
  authError.value = ''
}

async function handleAuthSubmit(payload) {
  authBusy.value = true
  authError.value = ''
  try {
    const data =
      authMode.value === 'login'
        ? await api.login({ email: payload.email, password: payload.password })
        : await api.register(payload)

    setStoredToken(data.token)
    user.value = data.user

    const localFavorites = [...favorites.value]
    const favoritesData = localFavorites.length
      ? await api.mergeFavorites(localFavorites)
      : await api.favorites()
    favorites.value = new Set(favoritesData.ids || [])

    const localViewed = [...viewedIds.value]
    const viewedData = localViewed.length
      ? await api.mergeViewed(localViewed)
      : await api.viewed()
    viewedIds.value = viewedData.ids || []

    authOpen.value = false
  } catch (error) {
    authError.value = error.message || 'Не удалось выполнить запрос'
  } finally {
    authBusy.value = false
  }
}

async function handleLogout() {
  try {
    await api.logout()
  } catch {
    // Сессия могла уже истечь — локальное состояние всё равно очищаем.
  }
  setStoredToken('')
  user.value = null
  userMenuOpen.value = false
}

async function restoreSession() {
  if (!getStoredToken()) return
  try {
    const { user: current } = await api.me()
    user.value = current

    const localFavorites = [...favorites.value]
    const favoritesData = localFavorites.length
      ? await api.mergeFavorites(localFavorites)
      : await api.favorites()
    favorites.value = new Set(favoritesData.ids || [])

    const localViewed = [...viewedIds.value]
    const viewedData = localViewed.length
      ? await api.mergeViewed(localViewed)
      : await api.viewed()
    viewedIds.value = viewedData.ids || []
  } catch {
    setStoredToken('')
    user.value = null
  }
}

function onKeydown(event) {
  if (event.key !== 'Escape') return
  if (selectedListing.value) closeDetails()
  else if (authOpen.value) closeAuth()
  else if (userMenuOpen.value) userMenuOpen.value = false
}

watch([selectedCity, propertyType], () => {
  if (selectedDistrict.value && !districts.value.includes(selectedDistrict.value)) {
    selectedDistrict.value = ''
  }
  const allowed = roomOptions.value.map((room) => room.value)
  selectedRooms.value = selectedRooms.value.filter((room) => allowed.includes(room))
})

// Если пользователь ищет город, которого ещё нет в снимке, справочник Циан
// находит его id и приложение само загружает этот город в фоне.
watch(normalizedSearch, (value) => {
  if (cityLookupTimer) clearTimeout(cityLookupTimer)
  if (value.length < 3) return

  cityLookupTimer = setTimeout(async () => {
    if (ensuringCity.value || viewMode.value !== 'all') return
    if (
      selectedCity.value ||
      selectedDistrict.value ||
      propertyType.value !== 'all' ||
      minPrice.value !== '' ||
      maxPrice.value !== '' ||
      selectedRooms.value.length
    ) {
      return
    }

    try {
      const found = await lookupCity(value)
      if (found && (!found.loaded || found.stale)) {
        await ensureCityData(found.city)
      }
    } catch {
      // Обычный поиск по объявлениям продолжает работать и без этого.
    }
  }, 750)
})

watch([selectedListing, authOpen], ([listing, auth]) => {
  document.body.style.overflow = listing || auth ? 'hidden' : ''
})

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  loadListings()
  restoreSession()
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  if (pollTimer) clearTimeout(pollTimer)
  if (cityLookupTimer) clearTimeout(cityLookupTimer)
  document.body.style.overflow = ''
})
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <a class="brand" href="#" aria-label="ДомРядом — на главную">
        <span class="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 32 32">
            <path d="M4 15 16 5l12 10v12H4V15Z" />
            <path d="M12 27V17h8v10" />
          </svg>
        </span>
        <span class="brand-name">ДОМ<span>РЯДОМ</span></span>
      </a>

      <div class="topbar-meta">
        <span class="topbar-place">
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M10 18s6-5.3 6-10a6 6 0 1 0-12 0c0 4.7 6 10 6 10Z" />
            <circle cx="10" cy="8" r="2" />
          </svg>
          {{ selectedCity || 'Все города' }}
        </span>
        <span class="source-chip">Циан</span>
      </div>

      <div class="topbar-actions">
        <button
          class="topbar-favorites"
          type="button"
          :class="{ active: viewMode === 'favorites' }"
          @click="showFavorites"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M12 20.2 4.7 13a4.8 4.8 0 0 1 6.8-6.8l.5.5.5-.5A4.8 4.8 0 1 1 19.3 13L12 20.2Z"
            />
          </svg>
          <span class="topbar-favorites-label">Избранное</span>
          <span v-if="favoritesCount" class="favorites-count">{{ favoritesCount }}</span>
        </button>

        <button
          v-if="!user"
          class="auth-button"
          type="button"
          @click="openAuth('login')"
        >
          Войти
        </button>

        <div v-else class="user-area">
          <button
            class="user-button"
            type="button"
            :aria-expanded="userMenuOpen"
            @click="userMenuOpen = !userMenuOpen"
          >
            <span class="user-avatar">{{ initials }}</span>
            <span class="user-name">{{ user.name }}</span>
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="m5 8 5 5 5-5" />
            </svg>
          </button>

          <div
            v-if="userMenuOpen"
            class="user-menu-backdrop"
            @click="userMenuOpen = false"
          ></div>
          <div v-if="userMenuOpen" class="user-menu">
            <div class="user-menu-head">
              <strong>{{ user.name }}</strong>
              <span>{{ user.email }}</span>
            </div>
            <button type="button" @click="showFavorites">
              Избранное <b>{{ favoritesCount }}</b>
            </button>
            <button type="button" @click="showViewed">
              Просмотренные <b>{{ viewedCount }}</b>
            </button>
            <button class="user-menu-logout" type="button" @click="handleLogout">
              Выйти
            </button>
          </div>
        </div>
      </div>
    </header>

    <section class="hero">
      <div class="hero-grid" aria-hidden="true"></div>
      <div class="hero-inner">
        <div class="hero-copy">
          <p class="eyebrow">
            АРЕНДА · КВАРТИРЫ И ДОМА · {{ cities.length }}
            {{ pluralize(cities.length, ['ГОРОД', 'ГОРОДА', 'ГОРОДОВ']) }}
          </p>
          <h1>
            НАЙДИ СВОЁ
            <em>МЕСТО В ГОРОДЕ</em>
          </h1>
          <p class="hero-description">
            Живая подборка объявлений с Циан: цена, район, комнаты, площадь и
            фотографии — без лишнего шума.
          </p>

          <form
            class="search-field"
            :class="{
              'is-searching': searchBusy || ensuringCity,
              'is-confirmed': searchFeedback,
            }"
            :aria-busy="searchBusy || ensuringCity"
            role="search"
            @submit.prevent="submitSearch"
          >
            <button
              class="search-submit"
              type="submit"
              :disabled="searchBusy || ensuringCity"
              aria-label="Найти"
            >
              <svg class="search-icon" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m16.5 16.5 4 4" />
              </svg>
            </button>
            <input
              v-model="search"
              type="search"
              placeholder="Поиск по названию, адресу или метро"
              aria-label="Поиск объявлений"
            />
            <button
              v-if="search"
              class="search-clear"
              type="button"
              aria-label="Очистить поиск"
              @click="search = ''"
            >
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="m5 5 10 10M15 5 5 15" />
              </svg>
            </button>
          </form>
        </div>

        <div class="hero-stats" aria-label="Статистика подборки">
          <div class="hero-stat">
            <strong>{{ listings.length }}</strong>
            <span>объявлений<br />в базе</span>
          </div>
          <div class="hero-stat">
            <strong>{{ cities.length }}</strong>
            <span>городов<br />России</span>
          </div>
          <div class="hero-stat">
            <strong>{{ minPriceLabel }}</strong>
            <span>минимальная<br />цена</span>
          </div>
        </div>
      </div>
      <nav class="hero-tape" aria-label="Быстрые фильтры">
        <template v-for="(filter, index) in quickFilters" :key="filter.key">
          <i v-if="index" aria-hidden="true">✦</i>
          <button
            class="hero-tape-tag"
            :class="{ 'is-active': activeQuickFilter === filter.key }"
            type="button"
            :aria-pressed="activeQuickFilter === filter.key"
            @click="applyQuickFilter(filter.key)"
          >
            {{ filter.label }}
          </button>
        </template>
      </nav>
    </section>

    <main class="page-content">
      <div class="data-status" :class="`is-${dataStatusTone}`">
        <span class="data-status-dot" aria-hidden="true"></span>
        <span class="data-status-text">{{ dataStatusText }}</span>
        <button
          v-if="refreshStatus !== 'running' && dataState !== 'loading'"
          class="data-status-action"
          type="button"
          :disabled="refreshStatus === 'running'"
          @click="manualRefresh"
        >
          Обновить
        </button>
      </div>

      <section class="filter-panel" aria-labelledby="filters-title">
        <div class="filter-head">
          <div>
            <p class="section-kicker">ПОДБОР</p>
            <h2 id="filters-title">Фильтры</h2>
          </div>
          <button v-if="activeFilters" class="text-button" type="button" @click="resetFilters">
            Сбросить всё
          </button>
        </div>

        <div class="filter-grid">
          <div class="filter-group">
            <label class="filter-label" for="city-select">Город</label>
            <select id="city-select" v-model="selectedCity">
              <option value="">Все города</option>
              <option v-for="city in cities" :key="city.name" :value="city.name">
                {{ city.name }} · {{ city.count }} из {{ listings.length }}
              </option>
            </select>
          </div>

          <div class="filter-group filter-type">
            <span class="filter-label">Тип жилья</span>
            <div class="type-switch" role="group" aria-label="Тип жилья">
              <button
                v-for="option in [
                  { value: 'all', label: 'Всё' },
                  { value: 'flat', label: 'Квартиры' },
                  { value: 'house', label: 'Дома' },
                ]"
                :key="option.value"
                type="button"
                :class="{ active: propertyType === option.value }"
                :aria-pressed="propertyType === option.value"
                @click="propertyType = option.value"
              >
                {{ option.label }}
              </button>
            </div>
          </div>

          <div class="filter-group filter-price">
            <span class="filter-label">Цена, ₽/мес.</span>
            <div class="price-inputs">
              <input
                v-model="minPrice"
                type="number"
                min="0"
                inputmode="numeric"
                :placeholder="priceBounds.min ? `от ${priceBounds.min}` : 'от'"
                aria-label="Минимальная цена"
              />
              <span class="price-dash">—</span>
              <input
                v-model="maxPrice"
                type="number"
                min="0"
                inputmode="numeric"
                :placeholder="priceBounds.max ? `до ${priceBounds.max}` : 'до'"
                aria-label="Максимальная цена"
              />
            </div>
          </div>

          <div class="filter-group">
            <label class="filter-label" for="sort-select">Сортировка</label>
            <select id="sort-select" v-model="sortBy">
              <option value="default">Как на Циан</option>
              <option value="price-asc">Сначала дешевле</option>
              <option value="price-desc">Сначала дороже</option>
              <option value="area-desc">Сначала просторнее</option>
            </select>
          </div>

          <div class="filter-group filter-rooms">
            <span class="filter-label">
              {{ propertyType === 'house' ? 'Спальни' : 'Комнатность' }}
            </span>
            <div class="room-chips">
              <button
                v-for="room in roomOptions"
                :key="room.value"
                class="room-chip"
                :class="{ active: selectedRooms.includes(room.value) }"
                type="button"
                :aria-pressed="selectedRooms.includes(room.value)"
                @click="toggleRoom(room.value)"
              >
                {{ room.label }}
              </button>
            </div>
          </div>

          <div class="filter-group">
            <label class="filter-label" for="district-select">Район</label>
            <select id="district-select" v-model="selectedDistrict">
              <option value="">Все районы</option>
              <option v-for="item in districts" :key="item" :value="item">{{ item }}</option>
            </select>
          </div>
        </div>
      </section>

      <div class="results-toolbar">
        <div>
          <p class="section-kicker">
            {{ viewMode === 'favorites' ? 'ИЗБРАННОЕ' : viewMode === 'viewed' ? 'ИСТОРИЯ' : 'РЕЗУЛЬТАТЫ' }}
          </p>
          <h2 class="results-title">{{ filteredListings.length }} {{ resultsLabel }}</h2>
        </div>

        <div class="toolbar-actions">
          <button
            v-if="viewMode === 'viewed' && viewedCount"
            class="text-button"
            type="button"
            @click="clearViewed"
          >
            Очистить историю
          </button>
          <div class="view-switch" role="group" aria-label="Режим списка">
            <button
              type="button"
              :class="{ active: viewMode === 'all' }"
              :aria-pressed="viewMode === 'all'"
              @click="showAll"
            >
              Все
            </button>
            <button
              type="button"
              :class="{ active: viewMode === 'favorites' }"
              :aria-pressed="viewMode === 'favorites'"
              @click="showFavorites"
            >
              Избранное <span v-if="favoritesCount">{{ favoritesCount }}</span>
            </button>
            <button
              type="button"
              :class="{ active: viewMode === 'viewed' }"
              :aria-pressed="viewMode === 'viewed'"
              @click="showViewed"
            >
              Просмотренные <span v-if="viewedCount">{{ viewedCount }}</span>
            </button>
          </div>
        </div>
      </div>

      <div v-if="dataState === 'loading' && !listings.length" class="data-loading">
        <span class="data-loader" aria-hidden="true"></span>
        <h2>Собираю объявления</h2>
        <p>
          Открываю Циан, прохожу по городам и типам жилья, затем парсю карточки.
          Первый запуск может занять пару минут.
        </p>
        <button class="btn btn-primary" type="button" @click="manualRefresh">
          Перезапустить сбор
        </button>
      </div>

      <div v-else-if="dataState === 'error' && !listings.length" class="data-loading is-error">
        <h2>Данные не загрузились</h2>
        <p>{{ dataError }}</p>
        <button class="btn btn-primary" type="button" @click="loadListings">
          Попробовать снова
        </button>
      </div>

      <div v-else-if="filteredListings.length" class="listings-grid">
        <ListingCard
          v-for="listing in filteredListings"
          :key="listing.id"
          :listing="listing"
          :favorite="favorites.has(String(listing.id))"
          @open="openListing"
          @favorite="toggleFavorite"
        />
      </div>

      <EmptyState
        v-else
        :mode="viewMode"
        :has-filters="activeFilters"
        @reset="resetFilters"
      />

      <footer class="footer">
        <div class="footer-brand">
          <span class="brand-mark small" aria-hidden="true">
            <svg viewBox="0 0 32 32">
              <path d="M4 15 16 5l12 10v12H4V15Z" />
              <path d="M12 27V17h8v10" />
            </svg>
          </span>
          <span>ДОМРЯДОМ</span>
        </div>
        <p>{{ listings.length }} объявлений · {{ cities.length }} городов · данные с Циан</p>
        <a
          class="footer-link"
          href="https://novosibirsk.cian.ru/snyat-kvartiru/"
          target="_blank"
          rel="noopener noreferrer"
        >
          Циан
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M7 13 13 7M8 7h5v5" />
          </svg>
        </a>
      </footer>
    </main>

    <ListingDetails
      v-if="selectedListing"
      :listing="selectedListing"
      :favorite="selectedIsFavorite"
      @close="closeDetails"
      @favorite="toggleFavorite"
    />

    <AuthModal
      :open="authOpen"
      :mode="authMode"
      :busy="authBusy"
      :error="authError"
      @close="closeAuth"
      @submit="handleAuthSubmit"
      @switch="switchAuth"
    />
  </div>
</template>

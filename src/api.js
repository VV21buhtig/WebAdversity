const TOKEN_KEY = 'dom-ryadom-token'

export function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY) || ''
}

export function setStoredToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

async function request(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const token = getStoredToken()
  if (auth && token) headers.Authorization = `Bearer ${token}`

  const response = await fetch(`/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data.error || `Ошибка запроса (${response.status})`)
  }
  return data
}

export const api = {
  listings: () => request('/listings', { auth: false }),
  listingsStatus: () => request('/listings/status', { auth: false }),
  refreshListings: (force = false, allCities = false) =>
    request('/listings/refresh', {
      method: 'POST',
      body: { force, allCities },
      auth: false,
    }),
  cities: (q = '', limit = 20) =>
    request(`/cities?q=${encodeURIComponent(q)}&limit=${limit}`, { auth: false }),
  ensureCity: (city) =>
    request('/listings/ensure-city', {
      method: 'POST',
      body: { cityId: city.id, cityName: city.name },
      auth: false,
    }),

  register: (payload) =>
    request('/auth/register', { method: 'POST', body: payload, auth: false }),
  login: (payload) =>
    request('/auth/login', { method: 'POST', body: payload, auth: false }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  me: () => request('/auth/me'),

  favorites: () => request('/me/favorites'),
  addFavorite: (id) =>
    request(`/me/favorites/${encodeURIComponent(id)}`, { method: 'PUT' }),
  removeFavorite: (id) =>
    request(`/me/favorites/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  mergeFavorites: (ids) =>
    request('/me/favorites/merge', { method: 'POST', body: { ids } }),

  viewed: () => request('/me/viewed'),
  markViewed: (id) =>
    request(`/me/viewed/${encodeURIComponent(id)}`, { method: 'POST' }),
  mergeViewed: (ids) =>
    request('/me/viewed/merge', { method: 'POST', body: { ids } }),
  clearViewed: () => request('/me/viewed', { method: 'DELETE' }),
}

export function formatPrice(value) {
  if (value === null || value === undefined || value === '') return 'Цена не указана'
  return `${new Intl.NumberFormat('ru-RU').format(value)} ₽/мес.`
}

export function formatArea(value) {
  if (value === null || value === undefined || value === '') return 'Площадь не указана'
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(value)} м²`
}

export function formatLandArea(value) {
  if (value === null || value === undefined || value === '') return ''
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(value)} сот.`
}

export function formatFloor(floor, floors) {
  if (floor === null || floor === undefined || floor === '') return ''
  if (floors === null || floors === undefined || floors === '') return `${floor} этаж`
  return `${floor}/${floors} этаж`
}

export function pluralize(value, forms) {
  const mod10 = value % 10
  const mod100 = value % 100
  if (mod10 === 1 && mod100 !== 11) return forms[0]
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return forms[1]
  return forms[2]
}

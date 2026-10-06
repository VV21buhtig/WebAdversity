import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { products } from '@/data/products'

export interface CartItem {
  id: number
  qty: number
}

const STORAGE_KEY = 'shop-cart-v1'
export const PROMO_CODE = 'WEB'
export const PROMO_DISCOUNT = 0.1

function load(): { items: CartItem[]; promo: boolean } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { items: [], promo: false }
    const data = JSON.parse(raw)
    const items = Array.isArray(data.items)
      ? data.items.filter(
          (i: unknown): i is CartItem =>
            typeof i === 'object' &&
            i !== null &&
            typeof (i as CartItem).id === 'number' &&
            typeof (i as CartItem).qty === 'number' &&
            (i as CartItem).qty > 0 &&
            products.some((p) => p.id === (i as CartItem).id),
        )
      : []
    return { items, promo: data.promo === true }
  } catch {
    return { items: [], promo: false }
  }
}

export const useCartStore = defineStore('cart', () => {
  const saved = load()
  const items = ref<CartItem[]>(saved.items)
  const promoApplied = ref(saved.promo)
  const promoError = ref('')

  watch(
    [items, promoApplied],
    () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ items: items.value, promo: promoApplied.value }))
    },
    { deep: true },
  )

  const priceOf = (id: number): number => {
    const p = products.find((p) => p.id === id)
    if (!p) return 0
    return promoApplied.value ? Math.round(p.price * (1 - PROMO_DISCOUNT)) : p.price
  }

  function add(id: number) {
    const found = items.value.find((i) => i.id === id)
    if (found) found.qty++
    else items.value.push({ id, qty: 1 })
  }

  function remove(id: number) {
    items.value = items.value.filter((i) => i.id !== id)
  }

  function setQty(id: number, qty: number) {
    if (qty <= 0) return remove(id)
    const found = items.value.find((i) => i.id === id)
    if (found) found.qty = qty
  }

  function clear() {
    items.value = []
  }

  function applyPromo(code: string) {
    if (code.trim().toUpperCase() === PROMO_CODE) {
      promoApplied.value = true
      promoError.value = ''
      return true
    }
    promoError.value = 'Неверный промокод'
    return false
  }

  function removePromo() {
    promoApplied.value = false
    promoError.value = ''
  }

  const count = computed(() => items.value.reduce((s, i) => s + i.qty, 0))
  const total = computed(() => items.value.reduce((s, i) => s + priceOf(i.id) * i.qty, 0))
  const totalWithoutDiscount = computed(() => {
    if (!promoApplied.value) return total.value
    return items.value.reduce((s, i) => {
      const p = products.find((p) => p.id === i.id)
      return s + (p ? p.price * i.qty : 0)
    }, 0)
  })

  return {
    items,
    promoApplied,
    promoError,
    add,
    remove,
    setQty,
    clear,
    applyPromo,
    removePromo,
    priceOf,
    count,
    total,
    totalWithoutDiscount,
  }
})

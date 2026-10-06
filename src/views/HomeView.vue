<script setup lang="ts">
import { computed, ref } from 'vue'
import { categories, products } from '@/data/products'
import { PROMO_CODE, useCartStore } from '@/stores/cart'

const cart = useCartStore()

const search = ref('')
const category = ref('Все')
const sortOrder = ref<'none' | 'asc' | 'desc'>('none')
const promoInput = ref('')

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  let list = products.filter(
    (p) =>
      (category.value === 'Все' || p.category === category.value) &&
      (q === '' || p.name.toLowerCase().includes(q)),
  )
  if (sortOrder.value === 'asc') list = [...list].sort((a, b) => a.price - b.price)
  if (sortOrder.value === 'desc') list = [...list].sort((a, b) => b.price - a.price)
  return list
})

const fmt = (n: number) => n.toLocaleString('ru-RU') + ' ₽'

function buyPromo() {
  if (cart.applyPromo(promoInput.value)) promoInput.value = ''
}
</script>

<template>
  <div class="shop">
    <header class="top">
      <h1>Магазин</h1>
      <div class="cart-badge">Корзина: {{ cart.count }} · {{ fmt(cart.total) }}</div>
    </header>

    <section class="controls">
      <input v-model="search" type="text" placeholder="Поиск товаров..." />
      <select v-model="category">
        <option v-for="c in categories" :key="c" :value="c">{{ c }}</option>
      </select>
      <select v-model="sortOrder">
        <option value="none">Без сортировки</option>
        <option value="asc">Цена: по возрастанию</option>
        <option value="desc">Цена: по убыванию</option>
      </select>
    </section>

    <p v-if="filtered.length === 0">Ничего не найдено</p>
    <section class="grid">
      <article v-for="p in filtered" :key="p.id" class="card">
        <img :src="p.image" :alt="p.name" loading="lazy" />
        <h3>{{ p.name }}</h3>
        <p class="cat">{{ p.category }}</p>
        <p class="price">
          <template v-if="cart.promoApplied">
            <s>{{ fmt(p.price) }}</s> {{ fmt(cart.priceOf(p.id)) }}
          </template>
          <template v-else>{{ fmt(p.price) }}</template>
        </p>
        <button @click="cart.add(p.id)">В корзину</button>
      </article>
    </section>

    <section class="cart">
      <h2>Корзина</h2>
      <p v-if="cart.items.length === 0">Пусто</p>
      <ul v-else>
        <li v-for="i in cart.items" :key="i.id">
          {{ products.find((p) => p.id === i.id)?.name }} —
          {{ fmt(cart.priceOf(i.id)) }} ×
          <button @click="cart.setQty(i.id, i.qty - 1)">−</button>
          {{ i.qty }}
          <button @click="cart.setQty(i.id, i.qty + 1)">+</button>
          = {{ fmt(cart.priceOf(i.id) * i.qty) }}
          <button @click="cart.remove(i.id)">Удалить</button>
        </li>
      </ul>
      <div v-if="cart.items.length > 0" class="totals">
        <p v-if="cart.promoApplied">
          Без скидки: <s>{{ fmt(cart.totalWithoutDiscount) }}</s> (−10%)
        </p>
        <p><strong>Итого: {{ fmt(cart.total) }}</strong></p>
        <button @click="cart.clear()">Очистить корзину</button>
      </div>
      <div class="promo">
        <template v-if="!cart.promoApplied">
          <input v-model="promoInput" type="text" placeholder="Промокод" />
          <button @click="buyPromo">Применить</button>
          <p v-if="cart.promoError" class="err">{{ cart.promoError }}</p>
          <p class="hint">Подсказка: {{ PROMO_CODE }} = −10%</p>
        </template>
        <template v-else>
          <p>Промокод {{ PROMO_CODE }} применён (−10%) <button @click="cart.removePromo()">Убрать</button></p>
        </template>
      </div>
    </section>
  </div>
</template>

<style scoped>
.shop { max-width: 960px; margin: 0 auto; padding: 16px; }
.top { display: flex; justify-content: space-between; align-items: center; }
.controls { display: flex; gap: 8px; margin: 16px 0; flex-wrap: wrap; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }
.card { border: 1px solid #ddd; border-radius: 8px; padding: 12px; }
.card img { width: 100%; height: 140px; object-fit: cover; border-radius: 4px; }
.cat { color: #666; font-size: 13px; }
.price { font-weight: bold; }
.cart { margin-top: 24px; border-top: 2px solid #333; padding-top: 12px; }
.err { color: red; }
.hint { color: #666; font-size: 13px; }
button { cursor: pointer; }
</style>

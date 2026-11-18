<script setup>
defineProps({
  mode: { type: String, default: 'all' },
  hasFilters: { type: Boolean, default: false },
})

defineEmits(['reset'])
</script>

<template>
  <div class="empty-state">
    <div class="empty-icon" aria-hidden="true">
      <svg viewBox="0 0 64 64">
        <circle cx="28" cy="28" r="15" />
        <path d="m39 39 12 12" />
        <path d="M22 28h12" />
      </svg>
    </div>

    <h2 v-if="mode === 'favorites'">В избранном пока пусто</h2>
    <h2 v-else-if="mode === 'viewed'">История просмотров пуста</h2>
    <h2 v-else>Ничего не нашлось</h2>

    <p v-if="mode === 'favorites'">
      Жмите на сердечко в карточке — объявления появятся здесь.
    </p>
    <p v-else-if="mode === 'viewed'">
      Откройте любое объявление, и оно автоматически попадёт в историю.
    </p>
    <p v-else-if="hasFilters">
      Слишком узкие фильтры. Сбросьте часть условий или выберите другой город.
    </p>
    <p v-else>В этой подборке пока нет объявлений.</p>

    <button
      v-if="hasFilters || mode !== 'all'"
      class="btn btn-primary"
      type="button"
      @click="$emit('reset')"
    >
      {{ mode === 'all' ? 'Сбросить фильтры' : 'Показать все объявления' }}
    </button>
  </div>
</template>

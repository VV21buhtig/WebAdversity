<script setup>
import { computed, ref } from 'vue'
import { formatArea, formatFloor, formatLandArea, formatPrice } from '../utils/format'

const props = defineProps({
  listing: { type: Object, required: true },
  favorite: { type: Boolean, default: false },
})

const emit = defineEmits(['open', 'favorite'])

const imageFailed = ref(false)
const photo = computed(() => props.listing.photos?.[0] || '')
const photoCount = computed(() => props.listing.photos?.length || 0)
const isHouse = computed(() => props.listing.propertyType === 'house')

const subtitle = computed(() => {
  if (props.listing.subtitle) {
    return props.listing.subtitle === props.listing.title ? '' : props.listing.subtitle
  }
  return (
    [
      props.listing.roomsLabel,
      props.listing.area ? formatArea(props.listing.area) : '',
      formatFloor(props.listing.floor, props.listing.floors),
    ]
      .filter(Boolean)
      .join(' · ') || 'Параметры не указаны'
  )
})

const specs = computed(() => {
  const parts = []
  if (props.listing.roomsLabel) parts.push(props.listing.roomsLabel)
  if (props.listing.area) parts.push(formatArea(props.listing.area))
  if (isHouse.value && props.listing.landArea) {
    parts.push(formatLandArea(props.listing.landArea))
  }
  return parts.join(' · ') || 'Параметры не указаны'
})
</script>

<template>
  <article
    class="listing-card"
    :class="`type-${props.listing.propertyType || 'flat'}`"
    tabindex="0"
    role="button"
    :aria-label="`Открыть объявление: ${props.listing.title || 'без названия'}`"
    @click="emit('open', props.listing)"
    @keydown.enter="emit('open', props.listing)"
  >
    <div class="card-media">
      <img
        v-if="photo && !imageFailed"
        :src="photo"
        :alt="props.listing.title || 'Фото жилья'"
        class="card-image"
        loading="lazy"
        referrerpolicy="no-referrer"
        @error="imageFailed = true"
      />
      <div v-else class="card-placeholder">
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <path d="M8 28 32 8l24 20v28H8V28Z" />
          <path d="M24 56V36h16v20" />
        </svg>
        <span>НЕТ ФОТО</span>
      </div>

      <div class="card-badges">
        <span class="badge badge-type">{{ isHouse ? 'ДОМ' : 'КВАРТИРА' }}</span>
        <span class="badge badge-source">{{ props.listing.source || 'Циан' }}</span>
        <span v-if="photoCount > 1" class="badge badge-photos">
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <rect x="2" y="5" width="16" height="12" rx="2" />
            <path d="m5 13 3-3 2.5 2.5L13 10l2 3" />
          </svg>
          {{ photoCount }}
        </span>
      </div>

      <button
        class="favorite-button"
        :class="{ 'is-favorite': props.favorite }"
        type="button"
        :aria-label="props.favorite ? 'Убрать из избранного' : 'Добавить в избранное'"
        :aria-pressed="props.favorite"
        @click.stop="emit('favorite', props.listing.id)"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 20.2 4.7 13a4.8 4.8 0 0 1 6.8-6.8l.5.5.5-.5A4.8 4.8 0 1 1 19.3 13L12 20.2Z"
          />
        </svg>
      </button>
    </div>

    <div class="card-body">
      <div class="card-price">{{ formatPrice(props.listing.price) }}</div>
      <h3 class="card-title">{{ props.listing.title || 'Объявление без названия' }}</h3>
      <p v-if="subtitle" class="card-subtitle">{{ subtitle }}</p>

      <div class="card-location">
        <span class="location-dot" aria-hidden="true"></span>
        <span>{{ props.listing.city || 'Город не указан' }}</span>
        <span v-if="props.listing.district" class="card-district">/ {{ props.listing.district }}</span>
        <span v-if="props.listing.metro" class="card-metro">· м. {{ props.listing.metro }}</span>
      </div>

      <p class="card-description" :class="{ 'is-empty': !props.listing.description }">
        {{ props.listing.description || 'Описание не указано' }}
      </p>

      <div class="card-footer">
        <span class="card-specs">{{ specs }}</span>
        <span class="card-more">
          Смотреть
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M4 10h11M11 5l5 5-5 5" />
          </svg>
        </span>
      </div>
    </div>
  </article>
</template>

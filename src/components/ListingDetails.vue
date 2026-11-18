<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  formatArea,
  formatFloor,
  formatLandArea,
  formatPrice,
} from '../utils/format'

const props = defineProps({
  listing: { type: Object, required: true },
  favorite: { type: Boolean, default: false },
})

const emit = defineEmits(['close', 'favorite'])

const activePhoto = ref(0)
const failedPhotos = ref(new Set())

const photos = computed(() => props.listing.photos || [])
const currentPhoto = computed(() => photos.value[activePhoto.value] || '')
const currentPhotoBroken = computed(() =>
  failedPhotos.value.has(currentPhoto.value),
)

const subtitle = computed(() => {
  if (props.listing.subtitle) {
    return props.listing.subtitle === props.listing.title
      ? ''
      : props.listing.subtitle
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

const isHouse = computed(() => props.listing.propertyType === 'house')

const facts = computed(() => {
  const result = [
    {
      label: isHouse.value ? 'Спальни' : 'Комнатность',
      value: props.listing.roomsLabel || '—',
    },
    {
      label: isHouse.value ? 'Площадь дома' : 'Площадь',
      value: props.listing.area ? formatArea(props.listing.area) : '—',
    },
  ]

  if (isHouse.value) {
    result.push({
      label: 'Участок',
      value: props.listing.landArea ? formatLandArea(props.listing.landArea) : '—',
    })
    result.push({
      label: 'Этажей',
      value: props.listing.floors ? `${props.listing.floors}` : '—',
    })
  } else {
    result.push({
      label: 'Этаж',
      value: formatFloor(props.listing.floor, props.listing.floors) || '—',
    })
  }

  result.push(
    { label: 'Город', value: props.listing.city || '—' },
    { label: 'Район', value: props.listing.district || '—' },
    { label: 'Метро', value: props.listing.metro || '—' },
  )
  return result
})

function goToPhoto(index) {
  if (!photos.value.length) return
  activePhoto.value = (index + photos.value.length) % photos.value.length
}

function markPhotoFailed(url) {
  failedPhotos.value = new Set([...failedPhotos.value, url])
}

function onKeydown(event) {
  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    goToPhoto(activePhoto.value - 1)
  }
  if (event.key === 'ArrowRight') {
    event.preventDefault()
    goToPhoto(activePhoto.value + 1)
  }
}

watch(
  () => props.listing,
  () => {
    activePhoto.value = 0
    failedPhotos.value = new Set()
  },
)

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="modal-backdrop" @click.self="emit('close')">
    <div
      class="details-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="details-title"
    >
      <button
        class="modal-close"
        type="button"
        aria-label="Закрыть подробную информацию"
        @click="emit('close')"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m6 6 12 12M18 6 6 18" />
        </svg>
      </button>

      <div class="details-gallery">
        <div class="gallery-main">
          <img
            v-if="currentPhoto && !currentPhotoBroken"
            :src="currentPhoto"
            :alt="`${props.listing.title || 'Жильё'} — фото ${activePhoto + 1}`"
            referrerpolicy="no-referrer"
            @error="markPhotoFailed(currentPhoto)"
          />
          <div v-else class="gallery-placeholder">
            <svg viewBox="0 0 64 64" aria-hidden="true">
              <path d="M8 28 32 8l24 20v28H8V28Z" />
              <path d="M24 56V36h16v20" />
            </svg>
            <span>Фотографии недоступны</span>
          </div>

          <template v-if="photos.length > 1">
            <button
              class="gallery-arrow gallery-prev"
              type="button"
              aria-label="Предыдущее фото"
              @click="goToPhoto(activePhoto - 1)"
            >
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="M12.5 4 6.5 10l6 6" />
              </svg>
            </button>
            <button
              class="gallery-arrow gallery-next"
              type="button"
              aria-label="Следующее фото"
              @click="goToPhoto(activePhoto + 1)"
            >
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="m7.5 4 6 6-6 6" />
              </svg>
            </button>
            <div class="gallery-counter">{{ activePhoto + 1 }} / {{ photos.length }}</div>
          </template>
        </div>

        <div v-if="photos.length > 1" class="gallery-thumbs">
          <button
            v-for="(photo, index) in photos"
            :key="photo"
            class="gallery-thumb"
            :class="{ active: index === activePhoto }"
            type="button"
            :aria-label="`Показать фото ${index + 1}`"
            @click="goToPhoto(index)"
          >
            <img
              :src="photo"
              alt=""
              loading="lazy"
              referrerpolicy="no-referrer"
              @error="markPhotoFailed(photo)"
            />
          </button>
        </div>
      </div>

      <div class="details-content">
        <div class="details-eyebrow">
          <span class="badge badge-type">{{ isHouse ? 'ДОМ' : 'КВАРТИРА' }}</span>
          <span class="badge badge-source">{{ props.listing.source || 'Циан' }}</span>
          <span v-if="props.listing.city" class="details-city">{{ props.listing.city }}</span>
          <span v-if="props.listing.published" class="details-published">
            {{ props.listing.published }}
          </span>
        </div>

        <div class="details-price">{{ formatPrice(props.listing.price) }}</div>
        <h2 id="details-title" class="details-title">
          {{ props.listing.title || 'Объявление без названия' }}
        </h2>
        <p v-if="subtitle" class="details-subtitle">{{ subtitle }}</p>

        <div class="details-actions">
          <button
            class="btn btn-favorite"
            :class="{ active: props.favorite }"
            type="button"
            @click="emit('favorite', props.listing.id)"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M12 20.2 4.7 13a4.8 4.8 0 0 1 6.8-6.8l.5.5.5-.5A4.8 4.8 0 1 1 19.3 13L12 20.2Z"
              />
            </svg>
            {{ props.favorite ? 'В избранном' : 'В избранное' }}
          </button>
          <a
            v-if="props.listing.url"
            class="btn btn-source"
            :href="props.listing.url"
            target="_blank"
            rel="noopener noreferrer"
          >
            Открыть на Циан
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="M7 13 13 7M8 7h5v5" />
            </svg>
          </a>
        </div>

        <dl class="details-facts">
          <div v-for="fact in facts" :key="fact.label" class="fact">
            <dt>{{ fact.label }}</dt>
            <dd>{{ fact.value }}</dd>
          </div>
        </dl>

        <section class="details-section">
          <h3>Описание</h3>
          <p :class="{ 'is-empty': !props.listing.description }">
            {{ props.listing.description || 'Описание не указано' }}
          </p>
        </section>

        <section v-if="props.listing.address" class="details-section">
          <h3>Адрес</h3>
          <p>{{ props.listing.address }}</p>
        </section>
      </div>
    </div>
  </div>
</template>

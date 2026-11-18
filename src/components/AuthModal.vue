<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  mode: { type: String, default: 'login' },
  busy: { type: Boolean, default: false },
  error: { type: String, default: '' },
})

const emit = defineEmits(['close', 'submit', 'switch'])

const name = ref('')
const email = ref('')
const password = ref('')

watch(
  () => props.open,
  (open) => {
    if (open) {
      name.value = ''
      email.value = ''
      password.value = ''
    }
  },
)

function onSubmit() {
  emit('submit', {
    name: name.value.trim(),
    email: email.value.trim(),
    password: password.value,
  })
}
</script>

<template>
  <div v-if="props.open" class="modal-backdrop auth-backdrop" @click.self="emit('close')">
    <div
      class="auth-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-title"
    >
      <button
        class="modal-close"
        type="button"
        aria-label="Закрыть окно входа"
        @click="emit('close')"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m6 6 12 12M18 6 6 18" />
        </svg>
      </button>

      <div class="auth-visual">
        <span class="auth-stamp">DOM / RYADOM · 2026</span>
        <h2 id="auth-title">
          {{ props.mode === 'login' ? 'Войти' : 'Регистрация' }}
        </h2>
        <p>
          Аккаунт синхронизирует избранное и историю просмотров между
          устройствами.
        </p>
        <div class="auth-visual-lines" aria-hidden="true">
          <span></span><span></span><span></span><span></span>
        </div>
        <b>+7 / ONLINE</b>
      </div>

      <form class="auth-form" @submit.prevent="onSubmit">
        <div class="auth-form-head">
          <span class="section-kicker">Личный кабинет</span>
          <h3>{{ props.mode === 'login' ? 'С возвращением' : 'Новый профиль' }}</h3>
        </div>

        <label v-if="props.mode === 'register'" class="auth-field">
          <span>Имя</span>
          <input
            v-model="name"
            type="text"
            name="name"
            autocomplete="name"
            placeholder="Как вас зовут"
            minlength="2"
            required
          />
        </label>

        <label class="auth-field">
          <span>Email</span>
          <input
            v-model="email"
            type="email"
            name="email"
            autocomplete="email"
            placeholder="you@example.com"
            required
          />
        </label>

        <label class="auth-field">
          <span>Пароль</span>
          <input
            v-model="password"
            type="password"
            name="password"
            :autocomplete="props.mode === 'login' ? 'current-password' : 'new-password'"
            placeholder="Минимум 6 символов"
            minlength="6"
            required
          />
        </label>

        <p v-if="props.error" class="auth-error">{{ props.error }}</p>

        <button class="btn btn-primary auth-submit" type="submit" :disabled="props.busy">
          {{ props.busy ? 'Подождите…' : props.mode === 'login' ? 'Войти' : 'Создать аккаунт' }}
        </button>

        <button
          class="auth-switch"
          type="button"
          @click="emit('switch', props.mode === 'login' ? 'register' : 'login')"
        >
          {{ props.mode === 'login' ? 'Нет аккаунта? Зарегистрироваться' : 'Уже есть аккаунт? Войти' }}
        </button>
      </form>
    </div>
  </div>
</template>

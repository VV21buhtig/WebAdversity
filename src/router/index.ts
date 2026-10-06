import AuthView from '@/views/AuthView.vue'
import HomeView from '@/views/HomeView.vue'
import { createRouter, createWebHashHistory, createWebHistory } from 'vue-router'

// Под file:// (упакованный Electron) history API без сервера не работает — там хэш.
const history =
  window.location.protocol === 'file:'
    ? createWebHashHistory()
    : createWebHistory(import.meta.env.BASE_URL)

const router = createRouter({
  history,
  routes: [
    {
      name: "HomeView",
      path: "/",
      component: HomeView
    },
    {
      name: "AuthView",
      path: "/auth",
      component: AuthView
    }
  ],
})

export default router

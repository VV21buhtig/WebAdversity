import AuthView from '@/views/AuthView.vue'
import HomeView from '@/views/HomeView.vue'
import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
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

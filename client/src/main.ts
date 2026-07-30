import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router.js'
import './styles/main.scss'

createApp(App).use(createPinia()).use(router).mount('#app')

// Только в собранной версии: в разработке service worker кэшировал бы модули Vite
// и прятал бы правки. Сбой регистрации приложение не ломает — оно работает и без него.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => undefined)
  })
}

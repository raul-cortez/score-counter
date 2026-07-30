import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { CurrentUser } from '@score/shared'
import { api, setToken } from '../api.js'

const TOKEN_KEY = 'score-counter-token'

/**
 * Кто мы такие.
 *
 * Токен — случайные 32 байта, подписывать нечего, поэтому лежит в localStorage.
 * После перезагрузки страницы личность восстанавливается запросом к /me, он же
 * подсказывает, в какую комнату вернуться.
 */
export const useSessionStore = defineStore('session', () => {
  const user = ref<CurrentUser | null>(null)
  const restored = ref(false)

  function remember(token: string): void {
    localStorage.setItem(TOKEN_KEY, token)
    setToken(token)
  }

  function forget(): void {
    localStorage.removeItem(TOKEN_KEY)
    setToken(null)
    user.value = null
  }

  /** Вызывается один раз при запуске: без неё маршрутизатор не знает, впускать ли. */
  async function restore(): Promise<void> {
    const token = localStorage.getItem(TOKEN_KEY)
    if (token !== null) {
      setToken(token)
      try {
        user.value = await api.get<CurrentUser>('/me')
      } catch {
        // Токен протух или база пересоздана — начинаем знакомство заново.
        forget()
      }
    }
    restored.value = true
  }

  async function loginAsGuest(nickname: string): Promise<void> {
    const res = await api.post<{ token: string; user: CurrentUser }>('/auth/guest', { nickname })
    remember(res.token)
    user.value = res.user
  }

  async function refresh(): Promise<void> {
    user.value = await api.get<CurrentUser>('/me')
  }

  return { user, restored, restore, loginAsGuest, refresh, forget }
})

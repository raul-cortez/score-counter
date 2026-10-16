import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { CurrentUser, NicknameSuggestion } from '@score/shared'
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

  /**
   * Вызывается один раз при запуске: без неё маршрутизатор не знает, впускать ли.
   *
   * Запрос к `/me` идёт даже без токена в localStorage: Safari сама вычищает его
   * через 7 дней бездействия (ITP), а резервная HttpOnly-кука той чисткой не
   * задета и продолжает опознавать браузер тем же самым токеном.
   */
  async function restore(): Promise<void> {
    const token = localStorage.getItem(TOKEN_KEY)
    if (token !== null) setToken(token)

    try {
      user.value = await api.get<CurrentUser>('/me')
    } catch {
      // Токена нет нигде, он протух или база пересоздана — начинаем знакомство заново.
      forget()
    }
    restored.value = true
  }

  async function loginAsGuest(nickname: string): Promise<void> {
    const res = await api.post<{ token: string; user: CurrentUser }>('/auth/guest', { nickname })
    remember(res.token)
    user.value = res.user
  }

  /**
   * Вход по логину и паролю.
   *
   * Это единственный способ узнать человека, когда пропало всё остальное: и
   * localStorage, и резервная кука. Пароль набирают один раз на устройство, зато
   * после него аккаунт узнаётся с любого телефона.
   */
  async function loginWithPassword(login: string, password: string): Promise<void> {
    const res = await api.post<{ token: string; user: CurrentUser }>('/auth/login', {
      login,
      password,
    })
    remember(res.token)
    user.value = res.user
  }

  /**
   * Привязка логина к нынешнему гостю.
   *
   * Заводя вторую запись, мы потеряли бы историю партий и место за столом, поэтому
   * логин приделывается к тому же пользователю.
   */
  async function attachLogin(login: string, password: string): Promise<void> {
    user.value = await api.post<CurrentUser>('/auth/upgrade', { login, password })
  }

  /**
   * Выход. Сессию и резервную куку гасит сервер — клиенту они недоступны.
   *
   * Забыть себя локально нужно в любом случае, даже если сети не было: иначе
   * человек нажмёт «выйти» и останется внутри, а это хуже, чем непогашенный
   * токен, который всё равно некому предъявить.
   */
  async function logout(): Promise<void> {
    try {
      await api.post('/auth/logout')
    } catch {
      // Сеть подвела на самом выходе. Себя всё равно забываем: серверная сессия
      // без токена бесполезна, а оставить человека внутри после нажатия «выйти»
      // хуже, чем редкий случай, когда куку погасить не удалось.
    } finally {
      forget()
    }
  }

  async function refresh(): Promise<void> {
    user.value = await api.get<CurrentUser>('/me')
  }

  /** Имя меняется у пользователя, поэтому одного ответа хватает: комнате сервер скажет сам. */
  async function rename(nickname: string): Promise<void> {
    user.value = await api.post<CurrentUser>('/me/nickname', { nickname })
  }

  /** Для кнопки «взять старое имя»: `null`, если пользователь ещё ни разу не менял ник. */
  async function randomPastNickname(): Promise<string | null> {
    const res = await api.get<NicknameSuggestion>('/me/nickname/random')
    return res.nickname
  }

  return {
    user,
    restored,
    restore,
    loginAsGuest,
    loginWithPassword,
    attachLogin,
    logout,
    rename,
    randomPastNickname,
    refresh,
    forget,
  }
})

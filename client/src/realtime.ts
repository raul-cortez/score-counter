import type { ServerFrame } from '@score/shared'
import { api } from './api.js'

/**
 * Подписка на поток комнаты.
 *
 * Переподключение написано руками, а не отдано браузеру, потому что билет
 * одноразовый: нативная попытка EventSource пойти по тому же URL упирается в 401,
 * а на ответ не-200 EventSource закрывается насовсем. Поэтому на каждую попытку
 * берём новый билет и создаём соединение заново, а Last-Event-ID держим сами.
 */

export type ConnectionStatus = 'connecting' | 'live' | 'offline'

/**
 * Все типы кадров подписываются поимённо: onmessage срабатывает только на кадры
 * без поля `event`, а сервер именует каждый.
 */
export const FRAME_TYPES = [
  'sync',
  'missed',
  'presence',
  'member_joined',
  'member_left',
  'member_renamed',
  'host_changed',
  'game_started',
  'game_finished',
  'entry_added',
  'entry_voided',
] as const

export type Stream = { close: () => void }

export type StreamHandlers = {
  onFrame: (frame: ServerFrame) => void
  onStatus: (status: ConnectionStatus) => void
}

/** Отступы между попытками: частые в начале, дальше реже, чтобы не долбить сервер. */
export const RETRY_DELAYS_MS = [500, 1000, 2000, 5000, 10_000]

export function retryDelay(attempt: number): number {
  return RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)]
}

/**
 * Сколько молчания считать обрывом.
 *
 * Сервер шлёт ping раз в 25 секунд. Порог с запасом на две пропущенные посылки:
 * соединение на телефоне часто умирает молча, и без этой проверки человек сидел бы
 * с замершим табло, а браузер считал бы поток открытым.
 */
export const SILENCE_LIMIT_MS = 60_000

/**
 * Через сколько молчания считать соединение мёртвым при возвращении к экрану.
 *
 * Телефон, уснув, замораживает и таймеры, и сокеты: просыпаешься — соединение
 * формально открыто, а на том конце давно никого. Порог мягче общего: ping ходит
 * раз в 25 секунд, поэтому 30 не даст ложных переподключений при простом
 * переключении вкладок, но поймает сон.
 */
export const WAKE_STALE_MS = 30_000

/**
 * Сколько неудачных попыток подряд терпеть, прежде чем сказать «нет связи».
 *
 * Обрыв на секунду — обычное дело в дороге и при пробуждении экрана; пугать им
 * не за чем. Первые попытки идут под вывеской «подключаемся», и обычно всё
 * успевает восстановиться, не потревожив стол.
 */
export const OFFLINE_AFTER_ATTEMPTS = 2

type Deps = {
  /** Подменяется в тестах: настоящий EventSource требует сети. */
  createEventSource?: (url: string) => EventSource
  setTimeoutFn?: typeof setTimeout
  setIntervalFn?: typeof setInterval
  now?: () => number
}

/** В тестах на сервере глобалей может не быть — тогда просто некому будить поток. */
const doc: Document | undefined = typeof document === 'undefined' ? undefined : document
const win: Window | undefined = typeof window === 'undefined' ? undefined : window

export function openRoomStream(
  code: string,
  handlers: StreamHandlers,
  deps: Deps = {},
): Stream {
  const createEventSource = deps.createEventSource ?? ((url: string) => new EventSource(url))
  const schedule = deps.setTimeoutFn ?? setTimeout
  const repeat = deps.setIntervalFn ?? setInterval
  const now = deps.now ?? Date.now

  let source: EventSource | null = null
  let attempt = 0
  let lastEventId: number | undefined
  let closed = false
  let lastHeard = now()
  /**
   * Номер живой попытки. Отложенное переподключение сверяется с ним перед тем,
   * как что-то делать: иначе пробуждение экрана и сработавший таймер открыли бы
   * два соединения разом, а комната посчитала бы человека дважды.
   */
  let generation = 0

  const statusFor = (): ConnectionStatus =>
    attempt < OFFLINE_AFTER_ATTEMPTS ? 'connecting' : 'offline'

  /**
   * Обрывает поток, который замолчал.
   *
   * Браузер может считать соединение открытым, когда на том конце уже никого нет:
   * так ведёт себя и промежуточный прокси, и телефон, потерявший сеть. Пока молчание
   * не замечено, человек смотрит на замершее табло и уверен, что всё в порядке.
   */
  function checkSilence(): void {
    if (closed || source === null) return
    if (now() - lastHeard < SILENCE_LIMIT_MS) return

    const dead = source
    source = null
    dead.close()
    retry()
  }

  repeat(checkSilence, SILENCE_LIMIT_MS / 4)

  function connect(): void {
    if (closed) return
    handlers.onStatus(statusFor())
    const mine = generation

    void (async () => {
      let ticket: string
      try {
        const issued = await api.post<{ ticket: string }>(`/rooms/${code}/events/ticket`)
        ticket = issued.ticket
      } catch {
        if (mine === generation) retry()
        return
      }
      // Пока ходили за билетом, экран мог проснуться и начать всё заново — тогда
      // это подключение уже лишнее, а билет одноразовый и просто протухнет.
      if (closed || mine !== generation) return

      const query = new URLSearchParams({ ticket })
      // Браузер сам Last-Event-ID уже не пришлёт: соединение создаётся заново.
      if (lastEventId !== undefined) query.set('lastEventId', String(lastEventId))

      const next = createEventSource(`/api/rooms/${code}/events?${query.toString()}`)
      source = next

      next.onopen = () => {
        attempt = 0
        lastHeard = now()
        handlers.onStatus('live')
      }

      // Ping приходит раз в 25 секунд и означает только одно: на том конце живы.
      next.addEventListener('ping', () => {
        lastHeard = now()
      })

      for (const type of FRAME_TYPES) {
        next.addEventListener(type, (event) => {
          const message = event as MessageEvent<string>
          lastHeard = now()
          if (message.lastEventId) lastEventId = Number(message.lastEventId)
          handlers.onFrame(JSON.parse(message.data) as ServerFrame)
        })
      }

      next.onerror = () => {
        next.close()
        if (source === next) source = null
        retry()
      }
    })()
  }

  function retry(): void {
    if (closed) return
    attempt += 1
    handlers.onStatus(statusFor())

    const delay = retryDelay(attempt - 1)
    const mine = ++generation
    schedule(() => {
      if (mine === generation) connect()
    }, delay)
  }

  /**
   * Экран вернулся к человеку — или сеть вернулась к телефону.
   *
   * Раньше после сна приложение ждало очередной попытки по расписанию: отступы
   * растут до десяти секунд, и всё это время на экране висело «нет связи», хотя
   * связь уже была. Здесь мы не ждём — пробуем немедленно.
   */
  function wake(): void {
    if (closed) return
    const alive = source !== null && now() - lastHeard < WAKE_STALE_MS
    if (alive) return

    const dead = source
    source = null
    dead?.close()

    // Отменяем отложенную попытку и начинаем как с чистого листа: раз человек
    // смотрит на экран, показывать ему «нет связи» с первой же секунды не надо.
    generation += 1
    attempt = 0
    connect()
  }

  function onVisible(): void {
    if (doc?.visibilityState !== 'hidden') wake()
  }

  doc?.addEventListener('visibilitychange', onVisible)
  win?.addEventListener('online', wake)
  // Возврат в приложение с телефона не всегда меняет видимость: iOS будит вкладку
  // из фона именно фокусом.
  win?.addEventListener('focus', onVisible)

  connect()

  return {
    close() {
      closed = true
      generation += 1
      doc?.removeEventListener('visibilitychange', onVisible)
      win?.removeEventListener('online', wake)
      win?.removeEventListener('focus', onVisible)
      source?.close()
      source = null
    },
  }
}

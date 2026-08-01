import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { PublicUser, RoomState, ServerFrame } from '@score/shared'
import { api } from '../api.js'
import { openRoomStream, type ConnectionStatus, type Stream } from '../realtime.js'

/** Что показать в ленте уведомлений: короткая фраза о том, что произошло. */
export type Notice = { id: number; text: string }

/**
 * Сколько уведомление висит само по себе.
 *
 * Раньше оно не уходило вообще, пока по нему не ткнут, и к середине партии экран
 * был заклеен сообщениями о входах и выходах. Пяти секунд хватает, чтобы прочитать
 * фразу в четыре слова, и мало, чтобы она успела помешать.
 */
export const NOTICE_TTL_MS = 5000

/**
 * Состояние комнаты.
 *
 * Каждый кадр из потока несёт готовый снимок, поэтому стор его заменяет целиком и
 * ничего не пересобирает из дельт. Дельта нужна только чтобы сказать «Аня записала
 * 15» — то есть на уведомления, не на состояние.
 */
export const useRoomStore = defineStore('room', () => {
  const state = ref<RoomState | null>(null)
  const status = ref<ConnectionStatus>('offline')
  const notices = ref<Notice[]>([])

  let stream: Stream | null = null
  let noticeSeq = 0
  /** Таймеры снятия: держим, чтобы уход из комнаты не оставил их тикать в пустоту. */
  const timers = new Map<number, ReturnType<typeof setTimeout>>()

  const nicknames = computed<Record<string, string>>(() => {
    const known: Record<string, string> = {}
    for (const member of state.value?.members ?? []) known[member.id] = member.nickname
    for (const player of state.value?.game?.players ?? []) known[player.id] = player.nickname
    return known
  })

  /** Ушедший из комнаты остаётся в составе игры, поэтому имя ищется в обоих списках. */
  function nameOf(userId: string): string {
    return nicknames.value[userId] ?? 'кто-то'
  }

  const isLive = computed(() => status.value === 'live')
  const players = computed<PublicUser[]>(() => state.value?.game?.players ?? [])

  function notice(text: string): void {
    noticeSeq += 1
    const id = noticeSeq
    notices.value = [...notices.value.slice(-4), { id, text }]
    timers.set(
      id,
      setTimeout(() => dismiss(id), NOTICE_TTL_MS),
    )
  }

  function dismiss(id: number): void {
    const timer = timers.get(id)
    if (timer !== undefined) {
      clearTimeout(timer)
      timers.delete(id)
    }
    notices.value = notices.value.filter((item) => item.id !== id)
  }

  function describe(frame: ServerFrame): string | null {
    switch (frame.type) {
      case 'member_joined':
        return `${nameOf((frame.payload as { userId: string }).userId)} в комнате`
      case 'member_left':
        return `${nameOf((frame.payload as { userId: string }).userId)} вышел`
      case 'member_renamed': {
        // Имя в снимке уже новое, поэтому старое берём из события — иначе фраза
        // получилась бы «Аня теперь Аня».
        const { previous, nickname } = frame.payload as { previous: string; nickname: string }
        return `${previous} теперь ${nickname}`
      }
      case 'host_changed':
        return `${nameOf((frame.payload as { hostUserId: string }).hostUserId)} теперь хост`
      case 'entry_voided':
        return `запись ${nameOf((frame.payload as { userId: string }).userId)} отменена`
      default:
        return null
    }
  }

  function apply(frame: ServerFrame): void {
    if (frame.type === 'missed') {
      if (frame.events.length > 0) notice(`пока вас не было: событий — ${frame.events.length}`)
      return
    }

    // Снимок приходит с каждым кадром, кроме missed: просто заменяем.
    state.value = frame.state

    if (frame.type === 'sync' || frame.type === 'presence') return
    const text = describe(frame)
    if (text !== null) notice(text)
  }

  async function load(code: string): Promise<void> {
    state.value = await api.get<RoomState>(`/rooms/${code}/state`)
  }

  function connect(code: string): void {
    disconnect()
    stream = openRoomStream(code, {
      onFrame: apply,
      onStatus: (next) => {
        status.value = next
      },
    })
  }

  function disconnect(): void {
    stream?.close()
    stream = null
    status.value = 'offline'
  }

  /** Действия возвращают снимок сами — он приезжает и потоком, но так экран не ждёт. */
  async function act(path: string, body?: unknown): Promise<void> {
    state.value = await api.post<RoomState>(path, body)
  }

  const join = (code: string, password?: string) =>
    act(`/rooms/${code}/join`, password === undefined ? {} : { password })
  const leave = (code: string) => act(`/rooms/${code}/leave`)
  const startGame = (code: string, scoreLimit: number) => act(`/rooms/${code}/games`, { scoreLimit })

  const addPoints = (gameId: string, userId: string, points: number) =>
    act(`/games/${gameId}/entries`, { id: crypto.randomUUID(), userId, points })
  const voidEntry = (entryId: string) => act(`/entries/${entryId}/void`)
  const replaceEntry = (entryId: string, points: number) =>
    act(`/entries/${entryId}/replace`, { id: crypto.randomUUID(), points })

  function reset(): void {
    disconnect()
    state.value = null
    for (const timer of timers.values()) clearTimeout(timer)
    timers.clear()
    notices.value = []
  }

  return {
    state,
    status,
    notices,
    isLive,
    players,
    nicknames,
    nameOf,
    apply,
    load,
    connect,
    disconnect,
    dismiss,
    join,
    leave,
    startGame,
    addPoints,
    voidEntry,
    replaceEntry,
    reset,
  }
})

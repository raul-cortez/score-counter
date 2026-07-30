import type { Db } from '../db/index.js'
import { nextHost } from '../domain/host.js'
import { findRoomById, listMemberIds, setHost } from '../repo/rooms.js'
import type { MutateRoom } from './mutate.js'
import type { Registry } from './registry.js'

/** Сколько ждать возвращения хоста, прежде чем отдать роль другому. */
export const HOST_GRACE_MS = 60_000

export type HostWatch = {
  /** Вызывается после каждого изменения состава онлайна в комнате. */
  presenceChanged: (roomId: string) => void
  stop: () => void
}

/**
 * Присматривает за тем, чтобы у комнаты был живой хост.
 *
 * Отсчёт заводится, когда хоста нет в сети, а кто-то другой есть, и снимается, как
 * только хост вернулся. Минута отсрочки заодно закрывает случай только что созданной
 * комнаты: хост успевает открыть поток задолго до срабатывания, поэтому отдельно
 * отслеживать «подключался ли он хоть раз» не нужно.
 *
 * Правило выбора преемника живёт в domain/host.ts и проверяется без таймеров.
 */
export function createHostWatch(deps: {
  db: Db
  registry: Registry
  mutate: MutateRoom
  graceMs?: number
}): HostWatch {
  const { db, registry, mutate } = deps
  const graceMs = deps.graceMs ?? HOST_GRACE_MS
  const timers = new Map<string, NodeJS.Timeout>()

  function cancel(roomId: string): void {
    const timer = timers.get(roomId)
    if (!timer) return
    clearTimeout(timer)
    timers.delete(roomId)
  }

  function handOver(roomId: string): void {
    timers.delete(roomId)

    const room = findRoomById(db, roomId)
    if (!room || room.closed_at !== null) return
    if (registry.isOnline(roomId, room.host_user_id)) return

    const successor = nextHost(
      listMemberIds(db, roomId),
      registry.onlineUserIds(roomId),
      room.host_user_id,
    )
    // Передавать некому — хост остаётся на месте, попробуем при следующем подключении.
    if (successor === null) return

    mutate(roomId, () => {
      setHost(db, roomId, successor)
      return [{ type: 'host_changed', payload: { hostUserId: successor, previous: room.host_user_id } }]
    })
  }

  return {
    presenceChanged(roomId) {
      const room = findRoomById(db, roomId)
      if (!room || room.closed_at !== null) {
        cancel(roomId)
        return
      }

      if (registry.isOnline(roomId, room.host_user_id)) {
        cancel(roomId)
        return
      }

      // Некому передавать и некому заметить — ждём, пока кто-нибудь подключится.
      if (registry.connectionCount(roomId) === 0) {
        cancel(roomId)
        return
      }

      if (timers.has(roomId)) return

      const timer = setTimeout(() => handOver(roomId), graceMs)
      // Незавершённый таймер не должен держать процесс и прогон тестов.
      timer.unref()
      timers.set(roomId, timer)
    },

    stop() {
      for (const timer of timers.values()) clearTimeout(timer)
      timers.clear()
    },
  }
}

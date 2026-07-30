import type { RoomEventType, RoomState } from '@score/shared'
import type { Db } from '../db/index.js'
import { appendEvent } from '../repo/events.js'
import { buildRoomState } from '../state/roomState.js'
import { formatFrame } from './sse.js'
import type { Registry } from './registry.js'

export type PendingEvent = { type: RoomEventType; payload: unknown }

export type MutateRoom = (roomId: string, mutation: () => PendingEvent[]) => RoomState

/**
 * Единственный способ изменить комнату.
 *
 * Порядок здесь и есть смысл обёртки: мутация и запись в журнал идут одной
 * транзакцией, а рассылка — строго после коммита. Откат поэтому физически не может
 * оставить разосланное событие, а маршрут возвращает тот же снимок, что ушёл в поток:
 * автор запроса и остальные видят одно и то же.
 *
 * better-sqlite3 синхронный, так что коммит атомарен относительно цикла событий и
 * порядок рассылки совпадает с порядком seq без дополнительной синхронизации.
 */
export function mutateRoom(
  db: Db,
  registry: Registry,
  roomId: string,
  mutation: () => PendingEvent[],
): RoomState {
  let recorded: { type: RoomEventType; payload: unknown; seq: number }[] = []

  db.transaction(() => {
    recorded = mutation().map((event) => ({
      ...event,
      seq: appendEvent(db, roomId, event.type, event.payload),
    }))
  })()

  const state = buildRoomState(db, roomId, registry.onlineUserIds(roomId))!

  // Одному запросу может отвечать несколько событий (запись очков, следом победа).
  // Снимок ко всем прикладывается один — итоговый: клиент им заменяет состояние,
  // а дельты читает по отдельности, ради уведомлений.
  for (const event of recorded) {
    registry.broadcast(
      roomId,
      formatFrame({
        id: event.seq,
        event: event.type,
        data: { type: event.type, seq: event.seq, payload: event.payload, state },
      }),
    )
  }

  return state
}

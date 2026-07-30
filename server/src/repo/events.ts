import type { RoomEvent, RoomEventType } from '@score/shared'
import type { Db } from '../db/index.js'

type EventRow = {
  seq: number
  room_id: string
  type: string
  payload: string
  created_at: number
}

function toRoomEvent(row: EventRow): RoomEvent {
  return {
    seq: row.seq,
    type: row.type as RoomEventType,
    payload: JSON.parse(row.payload) as unknown,
    createdAt: row.created_at,
  }
}

/**
 * Добавляет запись в журнал и возвращает её seq.
 *
 * Вызывается внутри той же транзакции, что и сама мутация: иначе клиенты могли бы
 * получить событие об изменении, которое откатилось.
 */
export function appendEvent(
  db: Db,
  roomId: string,
  type: RoomEventType,
  payload: unknown,
): number {
  const result = db
    .prepare(
      `INSERT INTO room_events (room_id, type, payload, created_at)
       VALUES (?, ?, ?, ?)`,
    )
    .run(roomId, type, JSON.stringify(payload), Date.now())

  return Number(result.lastInsertRowid)
}

/**
 * Что произошло в комнате после указанного seq.
 *
 * Нумерация сквозная по всей таблице, а не по комнате, поэтому фильтр по room_id
 * обязателен: без него сосед по процессу сдвигал бы чужой Last-Event-ID.
 */
export function listEventsSince(db: Db, roomId: string, since: number): RoomEvent[] {
  const rows = db
    .prepare('SELECT * FROM room_events WHERE room_id = ? AND seq > ? ORDER BY seq')
    .all(roomId, since) as EventRow[]

  return rows.map(toRoomEvent)
}

/** Ноль означает, что в комнате ещё ничего не происходило. */
export function lastSeq(db: Db, roomId: string): number {
  const row = db
    .prepare('SELECT MAX(seq) AS seq FROM room_events WHERE room_id = ?')
    .get(roomId) as { seq: number | null }

  return row.seq ?? 0
}

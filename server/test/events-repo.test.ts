import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { openDb, type Db } from '../src/db/index.js'
import { appendEvent, listEventsSince, lastSeq } from '../src/repo/events.js'
import { createRoom } from '../src/repo/rooms.js'
import { createGuest } from '../src/repo/users.js'

let db: Db
let roomA: string
let roomB: string

beforeEach(() => {
  db = openDb(':memory:')
  const host = createGuest(db, 'Хост')
  roomA = createRoom(db, 'Первая', null, host.id).id
  roomB = createRoom(db, 'Вторая', null, host.id).id
})

afterEach(() => db.close())

describe('журнал комнаты', () => {
  it('нумерует события возрастающе', () => {
    const first = appendEvent(db, roomA, 'member_joined', { userId: 'u1' })
    const second = appendEvent(db, roomA, 'member_left', { userId: 'u1' })

    expect(second).toBeGreaterThan(first)
  })

  it('отдаёт только то, что произошло после указанного seq', () => {
    appendEvent(db, roomA, 'member_joined', { userId: 'u1' })
    const boundary = appendEvent(db, roomA, 'member_joined', { userId: 'u2' })
    appendEvent(db, roomA, 'game_started', { gameId: 'g1' })

    const missed = listEventsSince(db, roomA, boundary)

    expect(missed.map((event) => event.type)).toEqual(['game_started'])
  })

  it('возвращает payload разобранным, а не строкой', () => {
    appendEvent(db, roomA, 'entry_added', { points: 15 })

    expect(listEventsSince(db, roomA, 0)[0].payload).toEqual({ points: 15 })
  })

  // Нумерация сквозная по таблице, поэтому фильтр по комнате обязателен:
  // иначе сосед по процессу сдвигал бы чужой Last-Event-ID.
  it('не смешивает журналы разных комнат', () => {
    appendEvent(db, roomA, 'member_joined', { userId: 'u1' })
    appendEvent(db, roomB, 'member_joined', { userId: 'u2' })
    appendEvent(db, roomA, 'member_left', { userId: 'u1' })

    expect(listEventsSince(db, roomB, 0)).toHaveLength(1)
    expect(listEventsSince(db, roomA, 0)).toHaveLength(2)
  })

  it('считает последний seq по своей комнате', () => {
    appendEvent(db, roomA, 'member_joined', { userId: 'u1' })
    const inB = appendEvent(db, roomB, 'member_joined', { userId: 'u2' })

    expect(lastSeq(db, roomB)).toBe(inB)
  })

  it('у комнаты без событий последний seq равен нулю', () => {
    expect(lastSeq(db, roomA)).toBe(0)
  })
})

import { randomUUID } from 'node:crypto'
import type { RoomSummary } from '@score/shared'
import type { Db } from '../db/index.js'
import { generateRoomCode } from '../domain/code.js'
import type { UserRow } from './users.js'

export type RoomRow = {
  id: string
  code: string
  name: string
  password_hash: string | null
  host_user_id: string
  created_at: number
  closed_at: number | null
}

export type RoomWithCounts = RoomRow & { member_count: number; active_games: number }

export function toRoomSummary(row: RoomWithCounts): RoomSummary {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    hasPassword: row.password_hash !== null,
    hostUserId: row.host_user_id,
    memberCount: row.member_count,
    gameActive: row.active_games > 0,
  }
}

const SUMMARY_SELECT = `
  SELECT rooms.*,
         (SELECT COUNT(*) FROM room_members
           WHERE room_members.room_id = rooms.id AND room_members.left_at IS NULL) AS member_count,
         (SELECT COUNT(*) FROM games
           WHERE games.room_id = rooms.id AND games.status = 'active') AS active_games
  FROM rooms
`

export function createRoom(
  db: Db,
  name: string,
  passwordHash: string | null,
  hostUserId: string,
): RoomRow {
  const insert = db.prepare(
    `INSERT INTO rooms (id, code, name, password_hash, host_user_id, created_at)
     VALUES (@id, @code, @name, @password_hash, @host_user_id, @created_at)`,
  )

  // Коллизия шестизначного кода маловероятна, но UNIQUE её поймает — просто пробуем ещё раз.
  for (let attempt = 0; attempt < 10; attempt++) {
    const row: RoomRow = {
      id: randomUUID(),
      code: generateRoomCode(),
      name,
      password_hash: passwordHash,
      host_user_id: hostUserId,
      created_at: Date.now(),
      closed_at: null,
    }
    try {
      insert.run(row)
      return row
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      if (!message.includes('rooms.code')) throw err
    }
  }
  throw new Error('не удалось подобрать свободный код комнаты')
}

export function findRoomById(db: Db, id: string): RoomRow | null {
  return (db.prepare('SELECT * FROM rooms WHERE id = ?').get(id) as RoomRow | undefined) ?? null
}

export function findRoomSummary(db: Db, id: string): RoomWithCounts | null {
  return (
    (db.prepare(`${SUMMARY_SELECT} WHERE rooms.id = ?`).get(id) as RoomWithCounts | undefined) ??
    null
  )
}

export function findRoomByCode(db: Db, code: string): RoomRow | null {
  return (
    (db.prepare('SELECT * FROM rooms WHERE code = ?').get(code) as RoomRow | undefined) ?? null
  )
}

export function listOpenRooms(db: Db): RoomWithCounts[] {
  return db
    .prepare(`${SUMMARY_SELECT} WHERE rooms.closed_at IS NULL ORDER BY rooms.created_at DESC`)
    .all() as RoomWithCounts[]
}

export function addMember(db: Db, roomId: string, userId: string): void {
  db.prepare(
    `INSERT INTO room_members (room_id, user_id, joined_at, left_at)
     VALUES (?, ?, ?, NULL)
     ON CONFLICT (room_id, user_id) DO UPDATE SET left_at = NULL`,
  ).run(roomId, userId, Date.now())
}

export function removeMember(db: Db, roomId: string, userId: string): void {
  db.prepare('UPDATE room_members SET left_at = ? WHERE room_id = ? AND user_id = ?').run(
    Date.now(),
    roomId,
    userId,
  )
}

/**
 * Порядок задаёт места за столом, поэтому он обязан быть устойчивым.
 * joined_at имеет миллисекундное разрешение: вошедшие одновременно получили бы
 * произвольный порядок и меняли бы места между играми — отсюда user_id вторым ключом.
 * При возвращении в комнату joined_at не переписывается, так что игрок садится на своё место.
 */
export function listMemberIds(db: Db, roomId: string): string[] {
  return (
    db
      .prepare(
        `SELECT user_id FROM room_members
         WHERE room_id = ? AND left_at IS NULL
         ORDER BY joined_at, user_id`,
      )
      .all(roomId) as { user_id: string }[]
  ).map((row) => row.user_id)
}

/** Порядок тот же, что у listMemberIds: места за столом обязаны быть устойчивыми. */
export function listMembers(db: Db, roomId: string): UserRow[] {
  return db
    .prepare(
      `SELECT users.* FROM room_members
       JOIN users ON users.id = room_members.user_id
       WHERE room_members.room_id = ? AND room_members.left_at IS NULL
       ORDER BY room_members.joined_at, users.id`,
    )
    .all(roomId) as UserRow[]
}

export function isMember(db: Db, roomId: string, userId: string): boolean {
  const row = db
    .prepare('SELECT 1 FROM room_members WHERE room_id = ? AND user_id = ? AND left_at IS NULL')
    .get(roomId, userId)
  return row !== undefined
}

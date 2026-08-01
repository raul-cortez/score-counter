import { randomUUID } from 'node:crypto'
import type { PublicUser } from '@score/shared'
import type { Db } from '../db/index.js'

export type UserRow = {
  id: string
  nickname: string
  email: string | null
  password_hash: string | null
  created_at: number
}

export function toPublicUser(row: UserRow): PublicUser {
  return { id: row.id, nickname: row.nickname, hasEmail: row.email !== null }
}

export function createGuest(db: Db, nickname: string): UserRow {
  const row: UserRow = {
    id: randomUUID(),
    nickname,
    email: null,
    password_hash: null,
    created_at: Date.now(),
  }
  db.prepare(
    `INSERT INTO users (id, nickname, email, password_hash, created_at)
     VALUES (@id, @nickname, @email, @password_hash, @created_at)`,
  ).run(row)
  return row
}

export function findUserById(db: Db, id: string): UserRow | null {
  return (db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined) ?? null
}

export function findUserByEmail(db: Db, email: string): UserRow | null {
  return (
    (db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined) ?? null
  )
}

/**
 * Имя меняется на месте, а не заводится второе.
 *
 * Записи очков ссылаются на пользователя, а не на имя, поэтому прошлые партии
 * начинают показывать новое имя — так и задумано: в истории человек ищет себя
 * по тому имени, каким его знают сейчас.
 */
export function renameUser(db: Db, userId: string, nickname: string): void {
  db.prepare('UPDATE users SET nickname = ? WHERE id = ?').run(nickname, userId)
}

export function attachEmail(db: Db, userId: string, email: string, passwordHash: string): void {
  db.prepare('UPDATE users SET email = ?, password_hash = ? WHERE id = ?').run(
    email,
    passwordHash,
    userId,
  )
}

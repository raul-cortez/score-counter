import type { Db } from '../db/index.js'
import { createToken, hashToken } from '../auth/tokens.js'
import { type UserRow } from './users.js'

/** Возвращает сырой токен — в базу уходит только его хэш. */
export function createSession(db: Db, userId: string): string {
  const token = createToken()
  const now = Date.now()
  db.prepare(
    `INSERT INTO sessions (token_hash, user_id, created_at, last_seen_at)
     VALUES (?, ?, ?, ?)`,
  ).run(hashToken(token), userId, now, now)
  return token
}

/** Выход: сессия уходит из базы целиком, а не помечается — возвращаться в неё нечем. */
export function deleteSession(db: Db, token: string): void {
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token))
}

export function findUserByToken(db: Db, token: string): UserRow | null {
  const row = db
    .prepare(
      `SELECT users.* FROM sessions
       JOIN users ON users.id = sessions.user_id
       WHERE sessions.token_hash = ?`,
    )
    .get(hashToken(token)) as UserRow | undefined
  return row ?? null
}

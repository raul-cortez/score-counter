import { randomUUID } from 'node:crypto'
import type { PublicUser } from '@score/shared'
import type { Db } from '../db/index.js'

export type UserRow = {
  id: string
  nickname: string
  login: string | null
  password_hash: string | null
  created_at: number
}

export function toPublicUser(row: UserRow): PublicUser {
  return { id: row.id, nickname: row.nickname, hasLogin: row.login !== null }
}

export function createGuest(db: Db, nickname: string): UserRow {
  const row: UserRow = {
    id: randomUUID(),
    nickname,
    login: null,
    password_hash: null,
    created_at: Date.now(),
  }
  db.prepare(
    `INSERT INTO users (id, nickname, login, password_hash, created_at)
     VALUES (@id, @nickname, @login, @password_hash, @created_at)`,
  ).run(row)
  recordNicknameHistory(db, row.id, nickname)
  return row
}

export function findUserById(db: Db, id: string): UserRow | null {
  return (db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined) ?? null
}

/** Логин в базе лежит приведённым к нижнему регистру — искать по нему же. */
export function findUserByLogin(db: Db, login: string): UserRow | null {
  return (
    (db.prepare('SELECT * FROM users WHERE login = ?').get(login) as UserRow | undefined) ?? null
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
  recordNicknameHistory(db, userId, nickname)
}

function recordNicknameHistory(db: Db, userId: string, nickname: string): void {
  db.prepare(
    'INSERT INTO nickname_history (user_id, nickname, created_at) VALUES (?, ?, ?)',
  ).run(userId, nickname, Date.now())
}

/** Одно из имён, которыми пользователь раньше пользовался, но не то, что сейчас — для кнопки «взять старое имя». */
export function randomPastNickname(db: Db, userId: string, currentNickname: string): string | null {
  const row = db
    .prepare(
      `SELECT DISTINCT nickname FROM nickname_history
       WHERE user_id = ? AND nickname != ?
       ORDER BY RANDOM() LIMIT 1`,
    )
    .get(userId, currentNickname) as { nickname: string } | undefined
  return row?.nickname ?? null
}

export function attachCredentials(
  db: Db,
  userId: string,
  login: string,
  passwordHash: string,
): void {
  db.prepare('UPDATE users SET login = ?, password_hash = ? WHERE id = ?').run(
    login,
    passwordHash,
    userId,
  )
}

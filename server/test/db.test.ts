import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { openDb } from '../src/db/index.js'

describe('openDb', () => {
  it('создаёт все таблицы схемы', () => {
    const db = openDb(':memory:')

    const names = db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`)
      .all()
      .map((row) => (row as { name: string }).name)

    expect(names).toEqual(
      expect.arrayContaining([
        'users',
        'sessions',
        'rooms',
        'room_members',
        'games',
        'game_players',
        'score_entries',
        'room_events',
      ]),
    )
    db.close()
  })

  it('включает проверку внешних ключей', () => {
    const db = openDb(':memory:')

    expect(db.pragma('foreign_keys', { simple: true })).toBe(1)

    db.close()
  })

  it('выдаёт score_entries.seq возрастающими значениями', () => {
    const db = openDb(':memory:')
    db.prepare(`INSERT INTO users (id, nickname, created_at) VALUES ('u1', 'Аня', 0)`).run()
    db.prepare(`INSERT INTO rooms (id, code, name, host_user_id, created_at)
                VALUES ('r1', 'ABCDEF', 'Комната', 'u1', 0)`).run()
    db.prepare(`INSERT INTO games (id, room_id, score_limit, status, started_at)
                VALUES ('g1', 'r1', 100, 'active', 0)`).run()

    const insert = db.prepare(
      `INSERT INTO score_entries (id, game_id, user_id, points, created_by, created_at)
       VALUES (?, 'g1', 'u1', 10, 'u1', 0)`,
    )
    const first = insert.run('e1').lastInsertRowid
    const second = insert.run('e2').lastInsertRowid

    expect(Number(second)).toBeGreaterThan(Number(first))
    db.close()
  })
})

/**
 * Колонка переименована уже после первого релиза, а `CREATE TABLE IF NOT EXISTS`
 * чужую таблицу не трогает. Без переноса на боевой базе осталась бы половина
 * схемы: привязки не потерялись бы, но и найти их стало бы нечем.
 */
describe('перенос учётных данных на логин', () => {
  /** База, какой она была до перехода: у пользователя есть почта и пароль. */
  function dbWithOldSchema(): { path: string; dir: string } {
    const dir = mkdtempSync(join(tmpdir(), 'score-db-'))
    const path = join(dir, 'score.db')

    const old = new Database(path)
    old.exec(`CREATE TABLE users (
      id            TEXT PRIMARY KEY,
      nickname      TEXT NOT NULL,
      email         TEXT UNIQUE,
      password_hash TEXT,
      created_at    INTEGER NOT NULL
    )`)
    old.prepare(
      `INSERT INTO users (id, nickname, email, password_hash, created_at)
       VALUES ('u1', 'Аня', 'anya@example.com', 'хеш', 0)`,
    ).run()
    old.close()

    return { path, dir }
  }

  it('старая почта становится логином', () => {
    const { path, dir } = dbWithOldSchema()
    const db = openDb(path)

    const row = db.prepare('SELECT * FROM users WHERE id = ?').get('u1') as { login: string | null }
    expect(row.login).toBe('anya@example.com')

    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('на свежей базе колонка сразу называется login', () => {
    const db = openDb(':memory:')

    const columns = (db.prepare('PRAGMA table_info(users)').all() as { name: string }[]).map(
      (column) => column.name,
    )
    expect(columns).toContain('login')
    expect(columns).not.toContain('email')

    db.close()
  })
})

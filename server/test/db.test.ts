import { describe, it, expect } from 'vitest'
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

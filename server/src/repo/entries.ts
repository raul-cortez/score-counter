import type { ScoreEntry } from '@score/shared'
import type { Db } from '../db/index.js'

export type EntryRow = {
  seq: number
  id: string
  game_id: string
  user_id: string
  points: number
  created_by: string
  created_at: number
  voided_at: number | null
  voided_by: string | null
}

export function toScoreEntry(row: EntryRow): ScoreEntry {
  return {
    seq: row.seq,
    id: row.id,
    gameId: row.game_id,
    userId: row.user_id,
    points: row.points,
    createdBy: row.created_by,
    createdAt: row.created_at,
    voidedAt: row.voided_at,
    voidedBy: row.voided_by,
  }
}

export function listEntries(db: Db, gameId: string): ScoreEntry[] {
  return (
    db.prepare('SELECT * FROM score_entries WHERE game_id = ? ORDER BY seq').all(gameId) as EntryRow[]
  ).map(toScoreEntry)
}

export function findEntryByClientId(db: Db, id: string): ScoreEntry | null {
  const row = db.prepare('SELECT * FROM score_entries WHERE id = ?').get(id) as EntryRow | undefined
  return row ? toScoreEntry(row) : null
}

export type NewEntry = {
  id: string
  gameId: string
  userId: string
  points: number
  createdBy: string
}

export function insertEntry(db: Db, entry: NewEntry): ScoreEntry {
  const info = db
    .prepare(
      `INSERT INTO score_entries (id, game_id, user_id, points, created_by, created_at)
       VALUES (@id, @gameId, @userId, @points, @createdBy, @createdAt)`,
    )
    .run({ ...entry, createdAt: Date.now() })

  const row = db
    .prepare('SELECT * FROM score_entries WHERE seq = ?')
    .get(info.lastInsertRowid) as EntryRow
  return toScoreEntry(row)
}

/** Отмена идемпотентна: повторный вызов не переписывает автора и время. */
export function voidEntry(db: Db, id: string, voidedBy: string): void {
  db.prepare(
    'UPDATE score_entries SET voided_at = ?, voided_by = ? WHERE id = ? AND voided_at IS NULL',
  ).run(Date.now(), voidedBy, id)
}

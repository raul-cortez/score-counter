import { randomUUID } from 'node:crypto'
import type { Game } from '@score/shared'
import type { Db } from '../db/index.js'

export type GameRow = {
  id: string
  room_id: string
  score_limit: number
  status: 'active' | 'finished' | 'abandoned'
  started_at: number
  finished_at: number | null
  winner_user_id: string | null
}

export function toGame(row: GameRow): Game {
  return {
    id: row.id,
    roomId: row.room_id,
    scoreLimit: row.score_limit,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    winnerUserId: row.winner_user_id,
  }
}

export function findGameById(db: Db, id: string): GameRow | null {
  return (db.prepare('SELECT * FROM games WHERE id = ?').get(id) as GameRow | undefined) ?? null
}

export function findActiveGame(db: Db, roomId: string): GameRow | null {
  return (
    (db
      .prepare(`SELECT * FROM games WHERE room_id = ? AND status = 'active'`)
      .get(roomId) as GameRow | undefined) ?? null
  )
}

export function listGamePlayerIds(db: Db, gameId: string): string[] {
  return (
    db
      .prepare('SELECT user_id FROM game_players WHERE game_id = ? ORDER BY seat')
      .all(gameId) as { user_id: string }[]
  ).map((row) => row.user_id)
}

/** Состав копируется из переданного списка одной транзакцией со строкой игры. */
export function startGame(
  db: Db,
  roomId: string,
  scoreLimit: number,
  playerIds: string[],
): GameRow {
  const row: GameRow = {
    id: randomUUID(),
    room_id: roomId,
    score_limit: scoreLimit,
    status: 'active',
    started_at: Date.now(),
    finished_at: null,
    winner_user_id: null,
  }

  const insertGame = db.prepare(
    `INSERT INTO games (id, room_id, score_limit, status, started_at, finished_at, winner_user_id)
     VALUES (@id, @room_id, @score_limit, @status, @started_at, @finished_at, @winner_user_id)`,
  )
  const insertPlayer = db.prepare(
    'INSERT INTO game_players (game_id, user_id, seat) VALUES (?, ?, ?)',
  )

  db.transaction(() => {
    insertGame.run(row)
    playerIds.forEach((userId, seat) => insertPlayer.run(row.id, userId, seat))
  })()

  return row
}

export function finishGame(db: Db, gameId: string, winnerUserId: string): void {
  db.prepare(
    `UPDATE games SET status = 'finished', finished_at = ?, winner_user_id = ?
     WHERE id = ? AND status = 'active'`,
  ).run(Date.now(), winnerUserId, gameId)
}

/** Отмена победной записи возвращает игру в активное состояние. */
export function reopenGame(db: Db, gameId: string): void {
  db.prepare(
    `UPDATE games SET status = 'active', finished_at = NULL, winner_user_id = NULL
     WHERE id = ? AND status = 'finished'`,
  ).run(gameId)
}

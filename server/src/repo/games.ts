import { randomUUID } from 'node:crypto'
import type { Game } from '@score/shared'
import type { Db } from '../db/index.js'
import { abandonCutoff } from '../domain/abandoned.js'
import type { UserRow } from './users.js'

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

/** Последняя начатая игра комнаты в любом статусе: экран победы переживает перезагрузку. */
export function findLatestGame(db: Db, roomId: string): GameRow | null {
  return (
    (db
      .prepare('SELECT * FROM games WHERE room_id = ? ORDER BY started_at DESC, id DESC LIMIT 1')
      .get(roomId) as GameRow | undefined) ?? null
  )
}

export function listGamePlayers(db: Db, gameId: string): UserRow[] {
  return db
    .prepare(
      `SELECT users.* FROM game_players
       JOIN users ON users.id = game_players.user_id
       WHERE game_players.game_id = ?
       ORDER BY game_players.seat`,
    )
    .all(gameId) as UserRow[]
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

/**
 * Гасит активные игры, в которых сутки ничего не происходило.
 *
 * Вызывается лениво, при чтении лобби и состояния комнаты, — фоновых таймеров в
 * процессе нет. Возраст считается по последней записи очков, а не по началу игры:
 * свежая запись в старой партии означает, что за столом ещё сидят.
 */
export function sweepAbandoned(db: Db, now: number): void {
  db.prepare(
    `UPDATE games SET status = 'abandoned'
     WHERE status = 'active'
       AND MAX(
             started_at,
             COALESCE((SELECT MAX(created_at) FROM score_entries
                        WHERE score_entries.game_id = games.id), 0)
           ) < ?`,
  ).run(abandonCutoff(now))
}

/** Отмена победной записи возвращает игру в активное состояние. */
export function reopenGame(db: Db, gameId: string): void {
  db.prepare(
    `UPDATE games SET status = 'active', finished_at = NULL, winner_user_id = NULL
     WHERE id = ? AND status = 'finished'`,
  ).run(gameId)
}

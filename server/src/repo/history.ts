import type { GameHistoryItem, GameStatus, MyStats, OpponentStat } from '@score/shared'
import type { Db } from '../db/index.js'
import { toPublicUser, type UserRow } from './users.js'

/**
 * Запросы истории и сводки.
 *
 * Счёт везде считается тем же правилом, что и в игре: сумма неотменённых записей.
 * Дублировать его в SQL приходится потому, что доменная функция работает по журналу
 * одной партии, а здесь нужны десятки партий одним запросом.
 */

const SCORE_OF = `
  COALESCE((SELECT SUM(points) FROM score_entries
             WHERE score_entries.game_id = games.id
               AND score_entries.user_id = ?
               AND score_entries.voided_at IS NULL), 0)
`

type HistoryRow = {
  id: string
  room_name: string
  room_code: string
  score_limit: number
  status: GameStatus
  started_at: number
  finished_at: number | null
  winner_user_id: string | null
  my_score: number
}

export function listMyGames(
  db: Db,
  userId: string,
  limit: number,
): GameHistoryItem[] {
  const rows = db
    .prepare(
      `SELECT games.id,
              rooms.name AS room_name,
              rooms.code AS room_code,
              games.score_limit,
              games.status,
              games.started_at,
              games.finished_at,
              games.winner_user_id,
              ${SCORE_OF} AS my_score
         FROM games
         JOIN rooms ON rooms.id = games.room_id
         JOIN game_players ON game_players.game_id = games.id
        WHERE game_players.user_id = ?
        ORDER BY games.started_at DESC, games.id DESC
        LIMIT ?`,
    )
    .all(userId, userId, limit) as HistoryRow[]

  // Состав добирается отдельным запросом на партию: списки короткие, а один
  // JOIN со склейкой строк читался бы куда хуже.
  const players = db.prepare(
    `SELECT users.* FROM game_players
       JOIN users ON users.id = game_players.user_id
      WHERE game_players.game_id = ?
      ORDER BY game_players.seat`,
  )

  return rows.map((row) => ({
    id: row.id,
    roomName: row.room_name,
    roomCode: row.room_code,
    scoreLimit: row.score_limit,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    winnerUserId: row.winner_user_id,
    myScore: row.my_score,
    players: (players.all(row.id) as UserRow[]).map(toPublicUser),
  }))
}

export function isGamePlayer(db: Db, gameId: string, userId: string): boolean {
  const row = db
    .prepare('SELECT 1 FROM game_players WHERE game_id = ? AND user_id = ?')
    .get(gameId, userId)
  return row !== undefined
}

export function buildMyStats(db: Db, userId: string): MyStats {
  // Только доигранные: брошенная партия не говорит ни о победах, ни о поражениях.
  const totals = db
    .prepare(
      `SELECT COUNT(*) AS played,
              COALESCE(SUM(CASE WHEN games.winner_user_id = ? THEN 1 ELSE 0 END), 0) AS wins,
              COALESCE(MAX(${SCORE_OF}), 0) AS best
         FROM games
         JOIN game_players ON game_players.game_id = games.id
        WHERE game_players.user_id = ?
          AND games.status = 'finished'`,
    )
    .get(userId, userId, userId) as { played: number; wins: number; best: number }

  const opponents = db
    .prepare(
      `SELECT users.*,
              COUNT(*) AS games,
              COALESCE(SUM(CASE WHEN games.winner_user_id = users.id THEN 1 ELSE 0 END), 0)
                AS their_wins
         FROM games
         JOIN game_players AS mine ON mine.game_id = games.id AND mine.user_id = ?
         JOIN game_players AS theirs ON theirs.game_id = games.id AND theirs.user_id <> ?
         JOIN users ON users.id = theirs.user_id
        WHERE games.status = 'finished'
        GROUP BY users.id
        ORDER BY games DESC, users.nickname`,
    )
    .all(userId, userId) as (UserRow & { games: number; their_wins: number })[]

  return {
    gamesPlayed: totals.played,
    wins: totals.wins,
    bestScore: totals.best,
    opponents: opponents.map(
      (row): OpponentStat => ({
        user: toPublicUser(row),
        games: row.games,
        theirWins: row.their_wins,
      }),
    ),
  }
}

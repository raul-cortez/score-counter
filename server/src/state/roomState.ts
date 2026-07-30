import type { RoomState, GameDetails } from '@score/shared'
import type { Db } from '../db/index.js'
import { scoreboard } from '../domain/score.js'
import { findRoomById, listMembers } from '../repo/rooms.js'
import { findLatestGame, listGamePlayers, type GameRow } from '../repo/games.js'
import { listEntries } from '../repo/entries.js'
import { toPublicUser } from '../repo/users.js'

/**
 * Единственный источник того, что клиент знает о комнате.
 * Всё, что меняет состояние, возвращает результат этой функции, поэтому
 * стор на клиенте разбирает одну форму, а не по одной на каждый маршрут.
 */
export function buildRoomState(db: Db, roomId: string): RoomState | null {
  const room = findRoomById(db, roomId)
  if (room === null) return null

  const game = findLatestGame(db, room.id)

  return {
    room: {
      id: room.id,
      code: room.code,
      name: room.name,
      hasPassword: room.password_hash !== null,
      hostUserId: room.host_user_id,
    },
    members: listMembers(db, room.id).map(toPublicUser),
    game: game === null ? null : buildGameDetails(db, game),
  }
}

function buildGameDetails(db: Db, game: GameRow): GameDetails {
  const players = listGamePlayers(db, game.id).map(toPublicUser)
  const entries = listEntries(db, game.id)

  return {
    id: game.id,
    scoreLimit: game.score_limit,
    status: game.status,
    startedAt: game.started_at,
    finishedAt: game.finished_at,
    winnerUserId: game.winner_user_id,
    players,
    entries,
    scores: scoreboard(
      entries,
      players.map((player) => player.id),
    ),
  }
}

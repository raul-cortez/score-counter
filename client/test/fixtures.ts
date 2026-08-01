import type { GameDetails, RoomState, ScoreEntry } from '@score/shared'

/**
 * Заготовки состояния.
 *
 * Типы берутся из @score/shared, того же пакета, которым отвечает сервер, поэтому
 * расхождение формы поймает проверка типов, а не отладка в браузере.
 */

export const ANYA = { id: 'u-anya', nickname: 'Аня', hasEmail: false }
export const BORIS = { id: 'u-boris', nickname: 'Борис', hasEmail: false }
export const VERA = { id: 'u-vera', nickname: 'Вера', hasEmail: false }

export function entry(over: Partial<ScoreEntry> = {}): ScoreEntry {
  return {
    seq: 1,
    id: 'e-1',
    gameId: 'g-1',
    userId: ANYA.id,
    points: 15,
    createdBy: ANYA.id,
    createdAt: 1_700_000_000_000,
    voidedAt: null,
    voidedBy: null,
    ...over,
  }
}

export function game(over: Partial<GameDetails> = {}): GameDetails {
  const entries = over.entries ?? [entry()]
  const players = over.players ?? [ANYA, BORIS]
  return {
    id: 'g-1',
    scoreLimit: 100,
    status: 'active',
    startedAt: 1_700_000_000_000,
    finishedAt: null,
    winnerUserId: null,
    players,
    entries,
    scores: Object.fromEntries(
      players.map((player) => [
        player.id,
        entries
          .filter((item) => item.userId === player.id && item.voidedAt === null)
          .reduce((sum, item) => sum + item.points, 0),
      ]),
    ),
    ...over,
  }
}

/**
 * Комнату переопределяют по одному полю — обычно чтобы поменять хоста, — поэтому
 * `room` принимается частичным: остальное берётся из заготовки.
 */
export function roomState(
  over: Partial<Omit<RoomState, 'room'>> & { room?: Partial<RoomState['room']> } = {},
): RoomState {
  return {
    room: {
      id: 'r-1',
      code: 'ABC234',
      name: 'Преферанс',
      hasPassword: false,
      hostUserId: ANYA.id,
      ...over.room,
    },
    members: over.members ?? [ANYA, BORIS],
    online: over.online ?? [ANYA.id],
    game: over.game === undefined ? game() : over.game,
  }
}

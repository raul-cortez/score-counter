import type { FastifyInstance } from 'fastify'
import { canAddEntryFor, canVoidEntry } from '../domain/permissions.js'
import { scoreboard } from '../domain/score.js'
import { findWinner } from '../domain/victory.js'
import { findRoomById } from '../repo/rooms.js'
import {
  findGameById,
  listGamePlayerIds,
  finishGame,
  reopenGame,
  toGame,
  type GameRow,
} from '../repo/games.js'
import {
  listEntries,
  findEntryByClientId,
  insertEntry,
  voidEntry,
} from '../repo/entries.js'
import type { Db } from '../db/index.js'

const addEntrySchema = {
  body: {
    type: 'object',
    required: ['id', 'userId', 'points'],
    additionalProperties: false,
    properties: {
      id: { type: 'string', minLength: 1, maxLength: 64 },
      userId: { type: 'string', minLength: 1, maxLength: 64 },
      points: { type: 'integer', minimum: -10000, maximum: 10000, not: { const: 0 } },
    },
  },
}

type AddEntryBody = { id: string; userId: string; points: number }

/**
 * Пересчитывает исход по всему журналу и приводит строку игры в соответствие.
 * Вызывается внутри той же транзакции, что и изменение журнала, — иначе два
 * почти одновременных запроса могут объявить двух победителей.
 */
function settleGame(db: Db, game: GameRow, playerIds: string[]): GameRow {
  const winner = findWinner(listEntries(db, game.id), playerIds, game.score_limit)

  if (winner && game.status === 'active') {
    finishGame(db, game.id, winner)
  } else if (!winner && game.status === 'finished') {
    reopenGame(db, game.id)
  }

  return findGameById(db, game.id)!
}

export default async function entryRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { id: string }; Body: AddEntryBody }>(
    '/games/:id/entries',
    { schema: addEntrySchema, preHandler: app.requireAuth },
    async (req, reply) => {
      const game = findGameById(app.db, req.params.id)
      if (!game) {
        return reply.code(404).send({ error: 'game_not_found' })
      }
      if (game.status !== 'active') {
        return reply.code(409).send({ error: 'game_not_active' })
      }

      const room = findRoomById(app.db, game.room_id)!
      const playerIds = listGamePlayerIds(app.db, game.id)
      const ctx = { actorId: req.currentUser!.id, hostId: room.host_user_id, playerIds }

      if (!canAddEntryFor(ctx, req.body.userId)) {
        return reply.code(403).send({ error: 'not_allowed' })
      }

      const result = app.db.transaction(() => {
        // Повтор того же запроса возвращает уже созданную запись, а не создаёт вторую.
        const existing = findEntryByClientId(app.db, req.body.id)
        const entry =
          existing ??
          insertEntry(app.db, {
            id: req.body.id,
            gameId: game.id,
            userId: req.body.userId,
            points: req.body.points,
            createdBy: req.currentUser!.id,
          })

        const settled = settleGame(app.db, game, playerIds)
        return { entry, settled }
      })()

      return {
        entry: result.entry,
        game: toGame(result.settled),
        scores: scoreboard(listEntries(app.db, game.id), playerIds),
      }
    },
  )

  app.post<{ Params: { id: string } }>(
    '/entries/:id/void',
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const entry = findEntryByClientId(app.db, req.params.id)
      if (!entry) {
        return reply.code(404).send({ error: 'entry_not_found' })
      }

      const game = findGameById(app.db, entry.gameId)!
      const room = findRoomById(app.db, game.room_id)!
      const playerIds = listGamePlayerIds(app.db, game.id)
      const ctx = { actorId: req.currentUser!.id, hostId: room.host_user_id, playerIds }

      if (!canVoidEntry(ctx, entry.userId)) {
        return reply.code(403).send({ error: 'not_allowed' })
      }

      const settled = app.db.transaction(() => {
        voidEntry(app.db, entry.id, req.currentUser!.id)
        return settleGame(app.db, game, playerIds)
      })()

      return {
        game: toGame(settled),
        scores: scoreboard(listEntries(app.db, game.id), playerIds),
      }
    },
  )
}

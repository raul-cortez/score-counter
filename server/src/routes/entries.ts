import type { FastifyInstance } from 'fastify'
import { canAddEntryFor, canVoidEntry } from '../domain/permissions.js'
import { scoreboard } from '../domain/score.js'
import { findRoomById } from '../repo/rooms.js'
import { findGameById, listGamePlayerIds } from '../repo/games.js'
import { listEntries, findEntryByClientId, insertEntry, voidEntry } from '../repo/entries.js'

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

      const entries = listEntries(app.db, game.id)
      return { entry, scores: scoreboard(entries, playerIds) }
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

      voidEntry(app.db, entry.id, req.currentUser!.id)

      const entries = listEntries(app.db, game.id)
      return { scores: scoreboard(entries, playerIds) }
    },
  )
}

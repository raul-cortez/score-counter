import type { FastifyInstance } from 'fastify'
import { canStartGame } from '../domain/permissions.js'
import { scoreboard } from '../domain/score.js'
import { findRoomByCode, listMemberIds, isMember } from '../repo/rooms.js'
import { buildRoomState } from '../state/roomState.js'
import {
  startGame,
  findActiveGame,
  findGameById,
  listGamePlayerIds,
  toGame,
} from '../repo/games.js'
import { listEntries } from '../repo/entries.js'

const startSchema = {
  body: {
    type: 'object',
    required: ['scoreLimit'],
    additionalProperties: false,
    properties: {
      scoreLimit: { type: 'integer', minimum: 1, maximum: 10000 },
    },
  },
}

export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 10

export default async function gameRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { code: string }; Body: { scoreLimit: number } }>(
    '/rooms/:code/games',
    { schema: startSchema, preHandler: app.requireAuth },
    async (req, reply) => {
      const room = findRoomByCode(app.db, req.params.code.toUpperCase())
      if (!room || room.closed_at !== null) {
        return reply.code(404).send({ error: 'room_not_found' })
      }

      const playerIds = listMemberIds(app.db, room.id)
      const ctx = { actorId: req.currentUser!.id, hostId: room.host_user_id, playerIds }
      if (!canStartGame(ctx)) {
        return reply.code(403).send({ error: 'only_host_may_start' })
      }
      if (findActiveGame(app.db, room.id)) {
        return reply.code(409).send({ error: 'game_already_active' })
      }
      if (playerIds.length < MIN_PLAYERS || playerIds.length > MAX_PLAYERS) {
        return reply.code(400).send({ error: 'bad_player_count' })
      }

      startGame(app.db, room.id, req.body.scoreLimit, playerIds)
      return buildRoomState(app.db, room.id)!
    },
  )

  app.get<{ Params: { id: string } }>(
    '/games/:id',
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const game = findGameById(app.db, req.params.id)
      if (!game) {
        return reply.code(404).send({ error: 'game_not_found' })
      }
      if (!isMember(app.db, game.room_id, req.currentUser!.id)) {
        return reply.code(403).send({ error: 'not_a_member' })
      }

      const playerIds = listGamePlayerIds(app.db, game.id)
      const entries = listEntries(app.db, game.id)

      return {
        ...toGame(game),
        playerIds,
        entries,
        scores: scoreboard(entries, playerIds),
      }
    },
  )
}

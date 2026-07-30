import type { FastifyInstance } from 'fastify'
import type { GameHistoryDetails } from '@score/shared'
import { canStartGame } from '../domain/permissions.js'
import { scoreboard } from '../domain/score.js'
import { findRoomByCode, findRoomById, listMemberIds, isMember } from '../repo/rooms.js'
import { isGamePlayer } from '../repo/history.js'
import { startGame, findActiveGame, findGameById, listGamePlayers } from '../repo/games.js'
import { listEntries } from '../repo/entries.js'
import { toPublicUser } from '../repo/users.js'

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

      return app.mutateRoom(room.id, () => {
        const game = startGame(app.db, room.id, req.body.scoreLimit, playerIds)
        return [
          { type: 'game_started', payload: { gameId: game.id, scoreLimit: game.score_limit } },
        ]
      })
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
      // Доступ по составу партии, а не только по членству в комнате: иначе ушедший
      // из комнаты терял бы доступ к собственной истории.
      const me = req.currentUser!.id
      if (!isGamePlayer(app.db, game.id, me) && !isMember(app.db, game.room_id, me)) {
        return reply.code(403).send({ error: 'not_a_member' })
      }

      // Отдаём имена, а не только идентификаторы: иначе экран истории не нарисовать,
      // а клиенту пришлось бы вторым запросом идти за составом.
      const room = findRoomById(app.db, game.room_id)!
      const players = listGamePlayers(app.db, game.id).map(toPublicUser)
      const entries = listEntries(app.db, game.id)

      const details: GameHistoryDetails = {
        id: game.id,
        roomName: room.name,
        roomCode: room.code,
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
      return details
    },
  )
}

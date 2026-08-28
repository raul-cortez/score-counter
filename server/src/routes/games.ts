import type { FastifyInstance } from 'fastify'
import type { GameHistoryDetails } from '@score/shared'
import { canStartGame, canManageRoom } from '../domain/permissions.js'
import { scoreboard } from '../domain/score.js'
import { findRoomByCode, findRoomById, listMemberIds, isMember } from '../repo/rooms.js'
import { isGamePlayer } from '../repo/history.js'
import {
  startGame,
  findActiveGame,
  findGameById,
  listGamePlayers,
  listGamePlayerIds,
  updateScoreLimit,
  removeGamePlayer,
} from '../repo/games.js'
import { listEntries } from '../repo/entries.js'
import { toPublicUser } from '../repo/users.js'
import { settleGame } from './entries.js'
import type { PendingEvent } from '../realtime/mutate.js'

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

const limitSchema = startSchema

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

  /**
   * Сменить лимит очков на ходу — например, ушёл игрок, и оставшиеся хотят
   * доиграть до другого счёта, не пересоздавая комнату. Победа пересчитывается
   * сразу же: новый лимит может оказаться уже пройденным.
   */
  app.post<{ Params: { id: string }; Body: { scoreLimit: number } }>(
    '/games/:id/limit',
    { schema: limitSchema, preHandler: app.requireAuth },
    async (req, reply) => {
      const game = findGameById(app.db, req.params.id)
      if (!game) return reply.code(404).send({ error: 'game_not_found' })
      if (game.status !== 'active') return reply.code(409).send({ error: 'game_not_active' })

      const room = findRoomById(app.db, game.room_id)!
      if (!canManageRoom(req.currentUser!.id, room.host_user_id)) {
        return reply.code(403).send({ error: 'not_allowed' })
      }

      return app.mutateRoom(game.room_id, () => {
        const previous = game.score_limit
        updateScoreLimit(app.db, game.id, req.body.scoreLimit)

        const events: PendingEvent[] = [
          { type: 'game_limit_changed', payload: { scoreLimit: req.body.scoreLimit, previous } },
        ]

        const updated = findGameById(app.db, game.id)!
        const winner = settleGame(app.db, updated, listGamePlayerIds(app.db, game.id))
        if (winner !== null) {
          events.push({ type: 'game_finished', payload: { gameId: game.id, winnerUserId: winner } })
        }
        return events
      })
    },
  )

  /**
   * Снять игрока с партии, не заканчивая её, — состав продолжает без него.
   * Из комнаты человек при этом не выгоняется: для этого есть отдельная ручка.
   */
  app.post<{ Params: { id: string; userId: string } }>(
    '/games/:id/players/:userId/remove',
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const game = findGameById(app.db, req.params.id)
      if (!game) return reply.code(404).send({ error: 'game_not_found' })
      if (game.status !== 'active') return reply.code(409).send({ error: 'game_not_active' })

      const room = findRoomById(app.db, game.room_id)!
      if (!canManageRoom(req.currentUser!.id, room.host_user_id)) {
        return reply.code(403).send({ error: 'not_allowed' })
      }

      const targetId = req.params.userId
      const playerIds = listGamePlayerIds(app.db, game.id)
      if (!playerIds.includes(targetId)) {
        return reply.code(404).send({ error: 'not_a_player' })
      }
      if (playerIds.length - 1 < MIN_PLAYERS) {
        return reply.code(400).send({ error: 'bad_player_count' })
      }

      return app.mutateRoom(game.room_id, () => {
        removeGamePlayer(app.db, game.id, targetId)

        const events: PendingEvent[] = [{ type: 'game_player_removed', payload: { userId: targetId } }]

        const winner = settleGame(app.db, game, listGamePlayerIds(app.db, game.id))
        if (winner !== null) {
          events.push({ type: 'game_finished', payload: { gameId: game.id, winnerUserId: winner } })
        }
        return events
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

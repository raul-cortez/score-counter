import type { FastifyInstance } from 'fastify'
import { canAddEntryFor, canVoidEntry } from '../domain/permissions.js'
import { findWinner } from '../domain/victory.js'
import { findRoomById } from '../repo/rooms.js'
import {
  findGameById,
  listGamePlayerIds,
  finishGame,
  reopenGame,
  type GameRow,
} from '../repo/games.js'
import { listEntries, findEntryByClientId, insertEntry, voidEntry } from '../repo/entries.js'
import type { PendingEvent } from '../realtime/mutate.js'
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

const replaceEntrySchema = {
  body: {
    type: 'object',
    required: ['id', 'points'],
    additionalProperties: false,
    properties: {
      id: { type: 'string', minLength: 1, maxLength: 64 },
      points: { type: 'integer', minimum: 1, maximum: 10000 },
    },
  },
}

type ReplaceEntryBody = { id: string; points: number }

/**
 * Пересчитывает исход по всему журналу и приводит строку игры в соответствие.
 * Вызывается внутри той же транзакции, что и изменение журнала, — иначе два
 * почти одновременных запроса могут объявить двух победителей.
 *
 * Возвращает победителя, если игра именно сейчас завершилась: об этом нужно
 * отдельное событие, чтобы клиент показал экран победы, а не вывел его из снимка.
 */
function settleGame(db: Db, game: GameRow, playerIds: string[]): string | null {
  const winner = findWinner(listEntries(db, game.id), playerIds, game.score_limit)

  if (winner && game.status === 'active') {
    finishGame(db, game.id, winner)
    return winner
  }
  if (!winner && game.status === 'finished') {
    reopenGame(db, game.id)
  }
  return null
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

      return app.mutateRoom(game.room_id, () => {
        const events: PendingEvent[] = []

        // Повтор того же запроса не создаёт вторую запись — и не порождает события.
        if (findEntryByClientId(app.db, req.body.id) === null) {
          const entry = insertEntry(app.db, {
            id: req.body.id,
            gameId: game.id,
            userId: req.body.userId,
            points: req.body.points,
            createdBy: req.currentUser!.id,
          })
          events.push({ type: 'entry_added', payload: { entry } })
        }

        const winner = settleGame(app.db, game, playerIds)
        if (winner !== null) {
          events.push({ type: 'game_finished', payload: { gameId: game.id, winnerUserId: winner } })
        }

        return events
      })
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

      return app.mutateRoom(game.room_id, () => {
        voidEntry(app.db, entry.id, req.currentUser!.id)
        // Отмена может вернуть игру в active — клиент увидит это в снимке.
        settleGame(app.db, game, playerIds)
        return [{ type: 'entry_voided', payload: { entryId: entry.id, userId: entry.userId } }]
      })
    },
  )

  /**
   * Исправить записанные очки: отменить прежнюю запись и завести новую одной
   * транзакцией.
   *
   * Отдельный маршрут нужен именно ради атомарности. Тем же самым двумя запросами
   * отмена победной записи успевала вернуть игру в active, и экран победы мигал у
   * всех за столом. Журнал при этом не переписывается: прежняя запись остаётся
   * видна отменённой, чтобы за столом было понятно, кто что исправил.
   */
  app.post<{ Params: { id: string }; Body: ReplaceEntryBody }>(
    '/entries/:id/replace',
    { schema: replaceEntrySchema, preHandler: app.requireAuth },
    async (req, reply) => {
      const entry = findEntryByClientId(app.db, req.params.id)
      if (!entry) {
        return reply.code(404).send({ error: 'entry_not_found' })
      }

      const game = findGameById(app.db, entry.gameId)!
      const room = findRoomById(app.db, game.room_id)!
      const playerIds = listGamePlayerIds(app.db, game.id)
      const ctx = { actorId: req.currentUser!.id, hostId: room.host_user_id, playerIds }

      if (!canVoidEntry(ctx, entry.userId) || !canAddEntryFor(ctx, entry.userId)) {
        return reply.code(403).send({ error: 'not_allowed' })
      }

      // Проверка повтора идёт раньше проверки отменённости: при обрыве связи клиент
      // шлёт тот же запрос ещё раз, а прежняя запись к тому моменту уже отменена.
      if (findEntryByClientId(app.db, req.body.id) !== null) {
        return app.roomState(game.room_id)!
      }
      if (entry.voidedAt !== null) {
        return reply.code(409).send({ error: 'entry_already_voided' })
      }

      return app.mutateRoom(game.room_id, () => {
        voidEntry(app.db, entry.id, req.currentUser!.id)
        const added = insertEntry(app.db, {
          id: req.body.id,
          gameId: game.id,
          userId: entry.userId,
          points: req.body.points,
          createdBy: req.currentUser!.id,
        })
        settleGame(app.db, game, playerIds)

        return [
          { type: 'entry_voided', payload: { entryId: entry.id, userId: entry.userId } },
          { type: 'entry_added', payload: { entry: added } },
        ]
      })
    },
  )
}

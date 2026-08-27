import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { RoomSummary } from '@score/shared'
import { hashPassword, verifyPassword } from '../auth/passwords.js'
import { canManageRoom } from '../domain/permissions.js'
import {
  createRoom,
  addMember,
  removeMember,
  renameRoom,
  closeRoom,
  listOpenRooms,
  findRoomByCode,
  findRoomSummary,
  toRoomSummary,
  isMember,
  type RoomRow,
} from '../repo/rooms.js'
import { findUserById, renameUser } from '../repo/users.js'
import { sweepAbandoned } from '../repo/games.js'

const createRoomSchema = {
  body: {
    type: 'object',
    required: ['name'],
    additionalProperties: false,
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 40 },
      password: { type: 'string', minLength: 1, maxLength: 100 },
    },
  },
}

const renameRoomSchema = {
  body: {
    type: 'object',
    required: ['name'],
    additionalProperties: false,
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 40 },
    },
  },
}

const joinSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    properties: {
      password: { type: 'string', maxLength: 100 },
    },
  },
}

/** Ник участника хост меняет глобально, тем же путём, что и сам пользователь себе — без лимита длины. */
const memberNicknameSchema = {
  body: {
    type: 'object',
    required: ['nickname'],
    additionalProperties: false,
    properties: {
      nickname: { type: 'string', minLength: 1 },
    },
  },
}

/** Код приходит из ссылки, которую могли продиктовать голосом, — регистр не важен. */
function requireOpenRoom(app: FastifyInstance, code: string, reply: FastifyReply): RoomRow | null {
  const room = findRoomByCode(app.db, code.toUpperCase())
  if (!room || room.closed_at !== null) {
    reply.code(404).send({ error: 'room_not_found' })
    return null
  }
  return room
}

function summaryOf(app: FastifyInstance, roomId: string): RoomSummary {
  return toRoomSummary(findRoomSummary(app.db, roomId)!)
}

export default async function roomRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: { name: string; password?: string } }>(
    '/rooms',
    { schema: createRoomSchema, preHandler: app.requireAuth },
    async (req) => {
      const host = req.currentUser!
      const passwordHash = req.body.password ? await hashPassword(req.body.password) : null

      const room = createRoom(app.db, req.body.name.trim(), passwordHash, host.id)
      addMember(app.db, room.id, host.id)

      // Событие не пишется: подписчиков у только что созданной комнаты быть не может.
      return app.roomState(room.id)!
    },
  )

  app.get('/rooms', { preHandler: app.requireAuth }, async () => {
    sweepAbandoned(app.db, Date.now())
    return listOpenRooms(app.db).map(toRoomSummary)
  })

  app.get<{ Params: { code: string } }>(
    '/rooms/:code',
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const room = requireOpenRoom(app, req.params.code, reply)
      if (!room) return reply
      return summaryOf(app, room.id)
    },
  )

  app.get<{ Params: { code: string } }>(
    '/rooms/:code/state',
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const room = requireOpenRoom(app, req.params.code, reply)
      if (!room) return reply
      if (!isMember(app.db, room.id, req.currentUser!.id)) {
        return reply.code(403).send({ error: 'not_a_member' })
      }
      sweepAbandoned(app.db, Date.now())
      return app.roomState(room.id)!
    },
  )

  app.post<{ Params: { code: string }; Body: { password?: string } }>(
    '/rooms/:code/join',
    {
      schema: joinSchema,
      preHandler: app.requireAuth,
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '5 minutes',
          // Ключ по паре «клиент + комната»: подбор пароля к одной комнате
          // не должен закрывать вход в остальные.
          keyGenerator: (req: FastifyRequest) =>
            `${req.ip}:${(req.params as { code: string }).code.toUpperCase()}`,
        },
      },
    },
    async (req, reply) => {
      const room = requireOpenRoom(app, req.params.code, reply)
      if (!room) return reply

      if (room.password_hash !== null) {
        const password = req.body.password ?? ''
        if (!(await verifyPassword(room.password_hash, password))) {
          return reply.code(403).send({ error: 'wrong_password' })
        }
      }

      const joined = req.currentUser!
      // Повторный вход уже состоящего не выдумывает событие: состав не изменился.
      if (isMember(app.db, room.id, joined.id)) {
        return app.roomState(room.id)!
      }

      return app.mutateRoom(room.id, () => {
        addMember(app.db, room.id, joined.id)
        return [{ type: 'member_joined', payload: { userId: joined.id } }]
      })
    },
  )

  app.post<{ Params: { code: string } }>(
    '/rooms/:code/leave',
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const room = requireOpenRoom(app, req.params.code, reply)
      if (!room) return reply

      const leaving = req.currentUser!
      if (!isMember(app.db, room.id, leaving.id)) {
        return app.roomState(room.id)!
      }

      return app.mutateRoom(room.id, () => {
        removeMember(app.db, room.id, leaving.id)
        return [{ type: 'member_left', payload: { userId: leaving.id } }]
      })
    },
  )

  app.post<{ Params: { code: string }; Body: { name: string } }>(
    '/rooms/:code/rename',
    { schema: renameRoomSchema, preHandler: app.requireAuth },
    async (req, reply) => {
      const room = requireOpenRoom(app, req.params.code, reply)
      if (!room) return reply
      if (!canManageRoom(req.currentUser!.id, room.host_user_id)) {
        return reply.code(403).send({ error: 'not_allowed' })
      }

      const name = req.body.name.trim()
      if (name === '') return reply.code(400).send({ error: 'bad_name' })
      if (name === room.name) return app.roomState(room.id)!

      return app.mutateRoom(room.id, () => {
        renameRoom(app.db, room.id, name)
        return [{ type: 'room_renamed', payload: { name, previous: room.name } }]
      })
    },
  )

  /**
   * Закрытие, а не удаление: партии и записи очков этой комнаты остаются в личной
   * истории игроков, только сама комната перестаёт открываться и приниматься.
   */
  app.post<{ Params: { code: string } }>(
    '/rooms/:code/close',
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const room = requireOpenRoom(app, req.params.code, reply)
      if (!room) return reply
      if (!canManageRoom(req.currentUser!.id, room.host_user_id)) {
        return reply.code(403).send({ error: 'not_allowed' })
      }

      return app.mutateRoom(room.id, () => {
        closeRoom(app.db, room.id)
        return [{ type: 'room_closed', payload: {} }]
      })
    },
  )

  app.post<{ Params: { code: string; userId: string } }>(
    '/rooms/:code/members/:userId/remove',
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const room = requireOpenRoom(app, req.params.code, reply)
      if (!room) return reply
      if (!canManageRoom(req.currentUser!.id, room.host_user_id)) {
        return reply.code(403).send({ error: 'not_allowed' })
      }

      const targetId = req.params.userId
      // Хоста через эту ручку не убрать: роль сначала нужно передать кому-то другому.
      if (targetId === room.host_user_id) {
        return reply.code(400).send({ error: 'cannot_remove_host' })
      }
      if (!isMember(app.db, room.id, targetId)) {
        return reply.code(404).send({ error: 'not_a_member' })
      }

      return app.mutateRoom(room.id, () => {
        removeMember(app.db, room.id, targetId)
        return [{ type: 'member_removed', payload: { userId: targetId } }]
      })
    },
  )

  /**
   * Хост меняет ник участника тем же путём, что и сам пользователь себе:
   * имя живёт у пользователя, а не в комнате, поэтому смена видна везде.
   */
  app.post<{ Params: { code: string; userId: string }; Body: { nickname: string } }>(
    '/rooms/:code/members/:userId/rename',
    { schema: memberNicknameSchema, preHandler: app.requireAuth },
    async (req, reply) => {
      const room = requireOpenRoom(app, req.params.code, reply)
      if (!room) return reply
      if (!canManageRoom(req.currentUser!.id, room.host_user_id)) {
        return reply.code(403).send({ error: 'not_allowed' })
      }

      const targetId = req.params.userId
      const target = findUserById(app.db, targetId)
      if (target === null || !isMember(app.db, room.id, targetId)) {
        return reply.code(404).send({ error: 'not_a_member' })
      }

      const nickname = req.body.nickname.trim()
      if (nickname === '') return reply.code(400).send({ error: 'bad_nickname' })

      return app.mutateRoom(room.id, () => {
        renameUser(app.db, targetId, nickname)
        return [
          { type: 'member_renamed', payload: { userId: targetId, nickname, previous: target.nickname } },
        ]
      })
    },
  )
}

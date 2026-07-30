import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { RoomSummary } from '@score/shared'
import { hashPassword, verifyPassword } from '../auth/passwords.js'
import {
  createRoom,
  addMember,
  removeMember,
  listOpenRooms,
  findRoomByCode,
  findRoomSummary,
  toRoomSummary,
  isMember,
  type RoomRow,
} from '../repo/rooms.js'
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

const joinSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    properties: {
      password: { type: 'string', maxLength: 100 },
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
}

import type { FastifyInstance } from 'fastify'
import { hashPassword, verifyPassword } from '../auth/passwords.js'
import {
  createRoom,
  addMember,
  removeMember,
  listOpenRooms,
  findRoomById,
  findRoomByCode,
  findRoomSummary,
  toRoomSummary,
} from '../repo/rooms.js'

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

export default async function roomRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: { name: string; password?: string } }>(
    '/rooms',
    { schema: createRoomSchema, preHandler: app.requireAuth },
    async (req) => {
      const host = req.currentUser!
      const passwordHash = req.body.password ? await hashPassword(req.body.password) : null

      const room = createRoom(app.db, req.body.name.trim(), passwordHash, host.id)
      addMember(app.db, room.id, host.id)

      return toRoomSummary(findRoomSummary(app.db, room.id)!)
    },
  )

  app.get('/rooms', { preHandler: app.requireAuth }, async () => {
    return listOpenRooms(app.db).map(toRoomSummary)
  })

  app.get<{ Params: { code: string } }>(
    '/rooms/by-code/:code',
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const room = findRoomByCode(app.db, req.params.code.toUpperCase())
      if (!room || room.closed_at !== null) {
        return reply.code(404).send({ error: 'room_not_found' })
      }
      return toRoomSummary(findRoomSummary(app.db, room.id)!)
    },
  )

  app.post<{ Params: { id: string }; Body: { password?: string } }>(
    '/rooms/:id/join',
    { schema: joinSchema, preHandler: app.requireAuth },
    async (req, reply) => {
      const room = findRoomById(app.db, req.params.id)
      if (!room || room.closed_at !== null) {
        return reply.code(404).send({ error: 'room_not_found' })
      }

      if (room.password_hash !== null) {
        const password = req.body.password ?? ''
        if (!(await verifyPassword(room.password_hash, password))) {
          return reply.code(403).send({ error: 'wrong_password' })
        }
      }

      addMember(app.db, room.id, req.currentUser!.id)
      return toRoomSummary(findRoomSummary(app.db, room.id)!)
    },
  )

  app.post<{ Params: { id: string } }>(
    '/rooms/:id/leave',
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const room = findRoomById(app.db, req.params.id)
      if (!room) {
        return reply.code(404).send({ error: 'room_not_found' })
      }

      removeMember(app.db, room.id, req.currentUser!.id)
      return toRoomSummary(findRoomSummary(app.db, room.id)!)
    },
  )
}

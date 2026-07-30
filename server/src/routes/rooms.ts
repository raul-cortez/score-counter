import type { FastifyInstance } from 'fastify'
import { hashPassword } from '../auth/passwords.js'
import {
  createRoom,
  addMember,
  listOpenRooms,
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
}

import type { FastifyInstance } from 'fastify'
import { createGuest, toPublicUser } from '../repo/users.js'
import { createSession } from '../repo/sessions.js'

const guestSchema = {
  body: {
    type: 'object',
    required: ['nickname'],
    additionalProperties: false,
    properties: {
      nickname: { type: 'string', minLength: 1, maxLength: 20 },
    },
  },
}

export default async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: { nickname: string } }>(
    '/auth/guest',
    { schema: guestSchema },
    async (req) => {
      const user = createGuest(app.db, req.body.nickname.trim())
      const token = createSession(app.db, user.id)
      return { token, user: toPublicUser(user) }
    },
  )

  app.get('/me', { preHandler: app.requireAuth }, async (req) => {
    return toPublicUser(req.currentUser!)
  })
}

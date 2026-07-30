import type { FastifyInstance } from 'fastify'
import {
  createGuest,
  toPublicUser,
  findUserByEmail,
  attachEmail,
} from '../repo/users.js'
import { createSession } from '../repo/sessions.js'
import { findActiveRoomCode } from '../repo/rooms.js'
import { hashPassword, verifyPassword } from '../auth/passwords.js'

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

/**
 * Проверка адреса намеренно минимальная: «что-то, собака, что-то, точка, что-то».
 * Строгие регулярные выражения для email отвергают действительные адреса чаще,
 * чем ловят опечатки, а подтверждения почты у нас пока нет.
 */
const EMAIL_PATTERN = '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$'

const credentialsSchema = {
  body: {
    type: 'object',
    required: ['email', 'password'],
    additionalProperties: false,
    properties: {
      email: { type: 'string', pattern: EMAIL_PATTERN, maxLength: 200 },
      password: { type: 'string', minLength: 8, maxLength: 200 },
    },
  },
}

type Credentials = { email: string; password: string }

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

  app.post<{ Body: Credentials }>(
    '/auth/upgrade',
    { schema: credentialsSchema, preHandler: app.requireAuth },
    async (req, reply) => {
      const email = req.body.email.toLowerCase()
      const existing = findUserByEmail(app.db, email)
      if (existing) {
        return reply.code(409).send({ error: 'email_taken' })
      }

      const user = req.currentUser!
      attachEmail(app.db, user.id, email, await hashPassword(req.body.password))
      return toPublicUser({ ...user, email })
    },
  )

  app.post<{ Body: Credentials }>(
    '/auth/login',
    { schema: credentialsSchema },
    async (req, reply) => {
      const user = findUserByEmail(app.db, req.body.email.toLowerCase())
      if (!user?.password_hash) {
        return reply.code(401).send({ error: 'invalid_credentials' })
      }
      if (!(await verifyPassword(user.password_hash, req.body.password))) {
        return reply.code(401).send({ error: 'invalid_credentials' })
      }

      return { token: createSession(app.db, user.id), user: toPublicUser(user) }
    },
  )

  app.get('/me', { preHandler: app.requireAuth }, async (req) => {
    const user = req.currentUser!
    return {
      ...toPublicUser(user),
      activeRoomCode: findActiveRoomCode(app.db, user.id),
    }
  })
}

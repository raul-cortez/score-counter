import type { FastifyInstance } from 'fastify'
import {
  createGuest,
  toPublicUser,
  findUserByEmail,
  attachEmail,
  renameUser,
} from '../repo/users.js'
import { createSession } from '../repo/sessions.js'
import { findActiveRoomCode, findRoomByCode } from '../repo/rooms.js'
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
    async (req, reply) => {
      const nickname = req.body.nickname.trim()
      if (nickname === '') return reply.code(400).send({ error: 'bad_nickname' })

      const user = createGuest(app.db, nickname)
      const token = createSession(app.db, user.id)
      return { token, user: toPublicUser(user) }
    },
  )

  /**
   * Смена имени.
   *
   * Имя живёт у пользователя, а не в комнате, поэтому меняется везде сразу —
   * и в составе, и в раздачах, и в прошлых партиях. Тем, кто сидит за столом,
   * новое имя нужно немедленно, иначе они будут искать в списке старое: пока
   * человек в комнате, рассылаем ей событие.
   */
  app.post<{ Body: { nickname: string } }>(
    '/me/nickname',
    { schema: guestSchema, preHandler: app.requireAuth },
    async (req, reply) => {
      const user = req.currentUser!
      const nickname = req.body.nickname.trim()
      if (nickname === '') return reply.code(400).send({ error: 'bad_nickname' })

      renameUser(app.db, user.id, nickname)

      const activeRoomCode = findActiveRoomCode(app.db, user.id)
      const room = activeRoomCode === null ? null : findRoomByCode(app.db, activeRoomCode)
      if (room !== null) {
        app.mutateRoom(room.id, () => [
          {
            type: 'member_renamed',
            payload: { userId: user.id, nickname, previous: user.nickname },
          },
        ])
      }

      return { ...toPublicUser({ ...user, nickname }), activeRoomCode }
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

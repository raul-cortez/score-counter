import type { FastifyInstance, FastifyRequest } from 'fastify'
import {
  createGuest,
  toPublicUser,
  findUserByLogin,
  attachCredentials,
  renameUser,
  randomPastNickname,
} from '../repo/users.js'
import { createSession, deleteSession } from '../repo/sessions.js'
import { findActiveRoomCode, findRoomByCode } from '../repo/rooms.js'
import { hashPassword, verifyPassword } from '../auth/passwords.js'
import { sessionCookie, clearedSessionCookie } from '../auth/cookies.js'

const guestSchema = {
  body: {
    type: 'object',
    required: ['nickname'],
    additionalProperties: false,
    properties: {
      nickname: { type: 'string', minLength: 1 },
    },
  },
}

/**
 * Логин — короткое слово, которое набирают с телефона за столом, поэтому в нём
 * только латиница, цифры и `._-`, без собаки: её ещё надо найти на клавиатуре.
 * Кириллицу не пускаем не из вредности — раскладку на телефоне переключают
 * незаметно для себя, и такой логин потом не набрать.
 *
 * Регистр не важен: в базу логин уходит приведённым к нижнему.
 */
const LOGIN_PATTERN = '^[A-Za-z0-9._-]{3,32}$'

const credentialsSchema = {
  body: {
    type: 'object',
    required: ['login', 'password'],
    additionalProperties: false,
    properties: {
      login: { type: 'string', pattern: LOGIN_PATTERN },
      password: { type: 'string', minLength: 8, maxLength: 200 },
    },
  },
}

type Credentials = { login: string; password: string }

export default async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: { nickname: string } }>(
    '/auth/guest',
    { schema: guestSchema },
    async (req, reply) => {
      const nickname = req.body.nickname.trim()
      if (nickname === '') return reply.code(400).send({ error: 'bad_nickname' })

      const user = createGuest(app.db, nickname)
      const token = createSession(app.db, user.id)
      reply.header('set-cookie', sessionCookie(token))
      // Комнат у нового гостя ещё нет, но поле в ответе быть обязано: клиент
      // кладёт `user` поверх себя целиком и на этом же типе держит остальные входы.
      return { token, user: { ...toPublicUser(user), activeRoomCode: null } }
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

  /**
   * Привязка логина к гостю, который уже играет.
   *
   * Второй раз это запрещено: менять логин, не спросив текущий пароль, значило бы
   * дать любому, кто дорвался до чужого телефона с открытой сессией, молча забрать
   * аккаунт себе.
   */
  app.post<{ Body: Credentials }>(
    '/auth/upgrade',
    { schema: credentialsSchema, preHandler: app.requireAuth },
    async (req, reply) => {
      const user = req.currentUser!
      if (user.login !== null) {
        return reply.code(409).send({ error: 'account_already_linked' })
      }

      const login = req.body.login.toLowerCase()
      if (findUserByLogin(app.db, login)) {
        return reply.code(409).send({ error: 'login_taken' })
      }

      attachCredentials(app.db, user.id, login, await hashPassword(req.body.password))
      // Форма ответа та же, что у `/me`: клиент кладёт её поверх себя целиком и не
      // должен при этом потерять код комнаты, куда человеку возвращаться.
      return {
        ...toPublicUser({ ...user, login }),
        activeRoomCode: findActiveRoomCode(app.db, user.id),
      }
    },
  )

  app.post<{ Body: Credentials }>(
    '/auth/login',
    {
      schema: credentialsSchema,
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '5 minutes',
          /**
           * Тело к этому моменту разобрано, поэтому ключ — пара «клиент + логин»:
           * подбор пароля к одному аккаунту не должен закрывать вход остальным
           * за тем же адресом, а за одним wi-fi за столом сидит вся компания.
           */
          hook: 'preValidation',
          keyGenerator: (req: FastifyRequest) =>
            `${req.ip}:${(req.body as Partial<Credentials> | undefined)?.login?.toLowerCase() ?? ''}`,
        },
      },
    },
    async (req, reply) => {
      const user = findUserByLogin(app.db, req.body.login.toLowerCase())
      if (!user?.password_hash) {
        return reply.code(401).send({ error: 'invalid_credentials' })
      }
      if (!(await verifyPassword(user.password_hash, req.body.password))) {
        return reply.code(401).send({ error: 'invalid_credentials' })
      }

      const token = createSession(app.db, user.id)
      reply.header('set-cookie', sessionCookie(token))
      // Код активной комнаты обязателен и здесь: человек, вернувшийся на новом
      // телефоне, должен попасть обратно за свой стол, а не в пустое лобби.
      return {
        token,
        user: { ...toPublicUser(user), activeRoomCode: findActiveRoomCode(app.db, user.id) },
      }
    },
  )

  /**
   * Выход. Мало стереть токен у себя — куку гасит только сервер, а без этого
   * следующий же запрос к `/me` опознал бы вышедшего по ней.
   */
  app.post('/auth/logout', { preHandler: app.requireAuth }, async (req, reply) => {
    if (req.currentToken !== null) deleteSession(app.db, req.currentToken)
    reply.header('set-cookie', clearedSessionCookie())
    return { ok: true }
  })

  /**
   * Помимо «кто я», на каждом заходе продлевает резервную куку: у активных
   * сессий, заведённых ещё до этой куки, она так появится сама, без повторного
   * входа, — а Max-Age сдвигается вперёд, пока приложением вообще пользуются.
   */
  app.get('/me', { preHandler: app.requireAuth }, async (req, reply) => {
    const user = req.currentUser!
    if (req.currentToken !== null) {
      reply.header('set-cookie', sessionCookie(req.currentToken))
    }
    return {
      ...toPublicUser(user),
      activeRoomCode: findActiveRoomCode(app.db, user.id),
    }
  })

  /** Для кнопки «взять старое имя» рядом с редактором ника. */
  app.get('/me/nickname/random', { preHandler: app.requireAuth }, async (req) => {
    const user = req.currentUser!
    return { nickname: randomPastNickname(app.db, user.id, user.nickname) }
  })
}

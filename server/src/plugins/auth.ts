import fp from 'fastify-plugin'
import type { FastifyReply, FastifyRequest } from 'fastify'
import type { RoomState } from '@score/shared'
import { findUserByToken } from '../repo/sessions.js'
import type { UserRow } from '../repo/users.js'
import type { Db } from '../db/index.js'
import type { Registry } from '../realtime/registry.js'
import type { Tickets } from '../realtime/tickets.js'
import type { MutateRoom } from '../realtime/mutate.js'

declare module 'fastify' {
  interface FastifyInstance {
    db: Db
    realtime: Registry
    tickets: Tickets
    /** Снимок комнаты вместе с онлайном из реестра соединений. */
    roomState: (roomId: string) => RoomState | null
    /** Единственный способ изменить комнату: транзакция, журнал, рассылка. */
    mutateRoom: MutateRoom
    requireAuth: (req: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
  interface FastifyRequest {
    currentUser: UserRow | null
  }
}

export default fp(async (app) => {
  app.decorateRequest('currentUser', null)

  app.addHook('onRequest', async (req) => {
    const header = req.headers.authorization
    if (!header?.startsWith('Bearer ')) return
    req.currentUser = findUserByToken(app.db, header.slice('Bearer '.length))
  })

  app.decorate('requireAuth', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.currentUser) {
      await reply.code(401).send({ error: 'unauthorized' })
    }
  })
})

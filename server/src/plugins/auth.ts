import fp from 'fastify-plugin'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { findUserByToken } from '../repo/sessions.js'
import type { UserRow } from '../repo/users.js'
import type { Db } from '../db/index.js'

declare module 'fastify' {
  interface FastifyInstance {
    db: Db
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

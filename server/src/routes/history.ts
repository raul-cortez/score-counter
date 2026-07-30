import type { FastifyInstance } from 'fastify'
import { listMyGames, buildMyStats } from '../repo/history.js'

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

const listSchema = {
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: {
      limit: { type: 'integer', minimum: 1, maximum: MAX_LIMIT },
    },
  },
}

export default async function historyRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { limit?: number } }>(
    '/me/games',
    { schema: listSchema, preHandler: app.requireAuth },
    async (req) => {
      return listMyGames(app.db, req.currentUser!.id, req.query.limit ?? DEFAULT_LIMIT)
    },
  )

  app.get('/me/stats', { preHandler: app.requireAuth }, async (req) => {
    return buildMyStats(app.db, req.currentUser!.id)
  })
}

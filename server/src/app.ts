import Fastify, { type FastifyInstance } from 'fastify'
import rateLimit from '@fastify/rate-limit'
import type { Db } from './db/index.js'
import authPlugin from './plugins/auth.js'
import authRoutes from './routes/auth.js'
import roomRoutes from './routes/rooms.js'
import gameRoutes from './routes/games.js'
import entryRoutes from './routes/entries.js'

export function buildApp(db: Db): FastifyInstance {
  const app = Fastify({ logger: false })

  app.decorate('db', db)
  // global: false — ограничения включаются точечно там, где они нужны.
  app.register(rateLimit, { global: false })
  app.register(authPlugin)

  app.get('/api/health', async () => ({ status: 'ok' }))
  app.register(authRoutes, { prefix: '/api' })
  app.register(roomRoutes, { prefix: '/api' })
  app.register(gameRoutes, { prefix: '/api' })
  app.register(entryRoutes, { prefix: '/api' })

  return app
}

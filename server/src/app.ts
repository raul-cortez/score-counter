import Fastify, { type FastifyInstance } from 'fastify'
import type { Db } from './db/index.js'
import authPlugin from './plugins/auth.js'
import authRoutes from './routes/auth.js'
import roomRoutes from './routes/rooms.js'
import gameRoutes from './routes/games.js'
import entryRoutes from './routes/entries.js'

export function buildApp(db: Db): FastifyInstance {
  const app = Fastify({ logger: false })

  app.decorate('db', db)
  app.register(authPlugin)

  app.get('/api/health', async () => ({ status: 'ok' }))
  app.register(authRoutes, { prefix: '/api' })
  app.register(roomRoutes, { prefix: '/api' })
  app.register(gameRoutes, { prefix: '/api' })
  app.register(entryRoutes, { prefix: '/api' })

  return app
}

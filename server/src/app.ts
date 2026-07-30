import Fastify, { type FastifyInstance } from 'fastify'
import addFormats from 'ajv-formats'
import type { Db } from './db/index.js'
import authPlugin from './plugins/auth.js'
import authRoutes from './routes/auth.js'
import roomRoutes from './routes/rooms.js'
import gameRoutes from './routes/games.js'

export function buildApp(db: Db): FastifyInstance {
  const app = Fastify({
    logger: false,
    ajv: { plugins: [addFormats] },
  })

  app.decorate('db', db)
  app.register(authPlugin)

  app.get('/api/health', async () => ({ status: 'ok' }))
  app.register(authRoutes, { prefix: '/api' })
  app.register(roomRoutes, { prefix: '/api' })
  app.register(gameRoutes, { prefix: '/api' })

  return app
}

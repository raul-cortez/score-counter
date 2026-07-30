import Fastify, { type FastifyInstance } from 'fastify'
import rateLimit from '@fastify/rate-limit'
import type { Db } from './db/index.js'
import authPlugin from './plugins/auth.js'
import errorsPlugin from './plugins/errors.js'
import authRoutes from './routes/auth.js'
import roomRoutes from './routes/rooms.js'
import gameRoutes from './routes/games.js'
import entryRoutes from './routes/entries.js'
import eventRoutes from './routes/events.js'
import historyRoutes from './routes/history.js'
import spaPlugin, { resolveAppShell } from './plugins/spa.js'
import { createRegistry } from './realtime/registry.js'
import { createTickets } from './realtime/tickets.js'
import { createHostWatch } from './realtime/hostWatch.js'
import { mutateRoom, type PendingEvent } from './realtime/mutate.js'
import { formatFrame } from './realtime/sse.js'
import { buildRoomState } from './state/roomState.js'

export type AppOptions = {
  /** Отсрочка перед автопередачей роли хоста. Уменьшается в тестах. */
  hostGraceMs?: number
  /** Срок жизни билета на подключение. */
  ticketTtlMs?: number
  /** Каталог собранного клиента. Без него сервер отдаёт только API. */
  staticRoot?: string
}

export function buildApp(db: Db, options: AppOptions = {}): FastifyInstance {
  // Поток событий не заканчивается сам: без принудительного закрытия остановка
  // сервера ждала бы каждого подписчика до последнего.
  const app = Fastify({ logger: false, forceCloseConnections: true })

  // Часть маршрутов не принимает тело, но клиенты обычно ставят этот заголовок на
  // каждый POST через общую обёртку. Штатный разбор Fastify отвечает на пустое тело
  // ошибкой 400 — считаем его отсутствующим, чтобы ответ не зависел от заголовка.
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (_req, body, done) => {
      if (body === '') {
        done(null, undefined)
        return
      }
      try {
        done(null, JSON.parse(body as string))
      } catch {
        const err = new Error('тело запроса не является корректным JSON') as Error & {
          statusCode: number
        }
        err.statusCode = 400
        done(err)
      }
    },
  )

  app.decorate('db', db)

  // Реестр, обёртка мутаций и присмотр за хостом ссылаются друг на друга по кругу,
  // поэтому связываются через функции: к моменту первого вызова всё уже создано.
  const registry = createRegistry({ onPresenceChange: (roomId) => presenceChanged(roomId) })
  const roomState = (roomId: string) =>
    buildRoomState(db, roomId, registry.onlineUserIds(roomId))
  const mutate = (roomId: string, mutation: () => PendingEvent[]) =>
    mutateRoom(db, registry, roomId, mutation)
  const hostWatch = createHostWatch({ db, registry, mutate, graceMs: options.hostGraceMs })

  /**
   * Presence не попадает в журнал: он живёт в памяти процесса и не переживает рестарт.
   * Кадр уходит без id, поэтому не сдвигает Last-Event-ID и не ломает догрузку.
   */
  function presenceChanged(roomId: string): void {
    const state = roomState(roomId)
    if (state !== null) {
      registry.broadcast(
        roomId,
        formatFrame({ event: 'presence', data: { type: 'presence', state } }),
      )
    }
    hostWatch.presenceChanged(roomId)
  }

  app.decorate('realtime', registry)
  app.decorate('tickets', createTickets({ ttlMs: options.ticketTtlMs }))
  app.decorate('roomState', roomState)
  app.decorate('mutateRoom', mutate)

  app.addHook('onClose', async () => {
    hostWatch.stop()
    registry.closeAll()
  })

  // global: false — ограничения включаются точечно там, где они нужны.
  app.register(rateLimit, {
    global: false,
    errorResponseBuilder: () => ({
      statusCode: 429,
      error: 'too_many_attempts',
      message: 'слишком много попыток, попробуйте позже',
    }),
  })
  const appShell = resolveAppShell(options.staticRoot)
  app.register(errorsPlugin, { appShell: appShell !== null })
  app.register(authPlugin)
  if (appShell !== null) app.register(spaPlugin, { root: appShell })

  app.get('/api/health', async () => ({ status: 'ok' }))
  app.register(authRoutes, { prefix: '/api' })
  app.register(roomRoutes, { prefix: '/api' })
  app.register(gameRoutes, { prefix: '/api' })
  app.register(entryRoutes, { prefix: '/api' })
  app.register(eventRoutes, { prefix: '/api' })
  app.register(historyRoutes, { prefix: '/api' })

  return app
}

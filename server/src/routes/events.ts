import type { FastifyInstance, FastifyReply } from 'fastify'
import { findRoomByCode, isMember, type RoomRow } from '../repo/rooms.js'
import { listEventsSince, lastSeq } from '../repo/events.js'
import { formatFrame, HEARTBEAT, HEARTBEAT_MS, SSE_HEADERS } from '../realtime/sse.js'
import { TICKET_TTL_MS } from '../realtime/tickets.js'
import type { Connection } from '../realtime/registry.js'

function requireMembership(
  app: FastifyInstance,
  code: string,
  userId: string,
  reply: FastifyReply,
): RoomRow | null {
  const room = findRoomByCode(app.db, code.toUpperCase())
  if (!room || room.closed_at !== null) {
    reply.code(404).send({ error: 'room_not_found' })
    return null
  }
  if (!isMember(app.db, room.id, userId)) {
    reply.code(403).send({ error: 'not_a_member' })
    return null
  }
  return room
}

export default async function eventRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Билет нужен потому, что браузерный EventSource не умеет слать заголовки,
   * а сессионному токену не место в URL: он осел бы в журналах прокси.
   */
  app.post<{ Params: { code: string } }>(
    '/rooms/:code/events/ticket',
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const user = req.currentUser!
      const room = requireMembership(app, req.params.code, user.id, reply)
      if (!room) return reply

      return {
        ticket: app.tickets.issue({ userId: user.id, roomId: room.id }),
        expiresIn: TICKET_TTL_MS,
      }
    },
  )

  app.get<{ Params: { code: string }; Querystring: { ticket?: string; lastEventId?: string } }>(
    '/rooms/:code/events',
    async (req, reply) => {
      const claim = req.query.ticket ? app.tickets.redeem(req.query.ticket) : null
      if (!claim) {
        return reply.code(401).send({ error: 'bad_ticket' })
      }

      const room = requireMembership(app, req.params.code, claim.userId, reply)
      if (!room) return reply
      // Билет привязан к комнате: предъявить его в соседней нельзя.
      if (claim.roomId !== room.id) {
        return reply.code(403).send({ error: 'bad_ticket' })
      }

      const raw = reply.raw
      reply.hijack()
      raw.writeHead(200, SSE_HEADERS)

      const connection: Connection = { userId: claim.userId, write: (chunk) => raw.write(chunk) }

      // Регистрация идёт до снимка, чтобы подключившийся увидел в online самого себя:
      // add рассылает presence всем, а следом уходит собственный sync — он и побеждает.
      app.realtime.add(room.id, connection)

      const seq = lastSeq(app.db, room.id)
      raw.write(
        formatFrame({
          id: seq,
          event: 'sync',
          data: { type: 'sync', seq, state: app.roomState(room.id)! },
        }),
      )

      // Заголовок присылает браузер при своём переподключении, параметр — клиент,
      // когда пересоздаёт соединение сам: билет одноразовый, поэтому переподключение
      // у нас ручное, а заголовки EventSource выставлять не умеет.
      const since = Number(req.query.lastEventId ?? req.headers['last-event-id'] ?? 0)
      if (Number.isFinite(since) && since > 0 && since < seq) {
        const missed = listEventsSince(app.db, room.id, since)
        if (missed.length > 0) {
          raw.write(formatFrame({ event: 'missed', data: { type: 'missed', events: missed } }))
        }
      }

      const heartbeat = setInterval(() => raw.write(HEARTBEAT), HEARTBEAT_MS)
      heartbeat.unref()

      const close = (): void => {
        clearInterval(heartbeat)
        app.realtime.remove(room.id, connection)
      }
      raw.on('close', close)
      raw.on('error', close)

      return reply
    },
  )
}

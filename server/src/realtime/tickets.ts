import { randomBytes } from 'node:crypto'

/**
 * Одноразовые билеты на подключение к потоку.
 *
 * Браузерный EventSource не умеет отправлять заголовки, поэтому сессионный токен
 * в поток не передать. Билет живёт полминуты и сгорает при первом предъявлении —
 * его попадание в журналы прокси безвредно, в отличие от токена сессии.
 *
 * Хранится в памяти процесса: после рестарта клиент просто возьмёт новый билет.
 */

export type TicketClaim = { userId: string; roomId: string }

export type Tickets = {
  issue: (claim: TicketClaim) => string
  redeem: (ticket: string) => TicketClaim | null
}

export const TICKET_TTL_MS = 30_000

export function createTickets(
  options: { ttlMs?: number; now?: () => number } = {},
): Tickets {
  const ttlMs = options.ttlMs ?? TICKET_TTL_MS
  const now = options.now ?? Date.now
  const issued = new Map<string, TicketClaim & { expiresAt: number }>()

  return {
    issue(claim) {
      const at = now()

      // Уборка на выдаче: отдельный таймер ради полуминутных записей не нужен.
      for (const [key, value] of issued) {
        if (value.expiresAt <= at) issued.delete(key)
      }

      const ticket = randomBytes(32).toString('hex')
      issued.set(ticket, { ...claim, expiresAt: at + ttlMs })
      return ticket
    },

    redeem(ticket) {
      const found = issued.get(ticket)
      if (!found) return null

      issued.delete(ticket)
      if (found.expiresAt <= now()) return null

      return { userId: found.userId, roomId: found.roomId }
    },
  }
}

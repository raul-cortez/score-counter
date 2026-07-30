import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import {
  makeApp,
  closeApp,
  createGuestSession,
  bearer,
  type TestApp,
  type Guest,
} from './helpers.js'

let ctx: TestApp

beforeEach(async () => {
  ctx = await makeApp()
})

afterEach(async () => {
  await closeApp(ctx)
})

type Table = { gameId: string; anya: Guest; boris: Guest }

async function tableOfTwo(app: FastifyInstance, scoreLimit = 100): Promise<Table> {
  const anya = await createGuestSession(app, 'Аня')
  const boris = await createGuestSession(app, 'Борис')
  const room = await app.inject({
    method: 'POST',
    url: '/api/rooms',
    headers: bearer(anya),
    payload: { name: 'Вечер преферанса' },
  })
  const roomId = room.json().id
  await app.inject({
    method: 'POST',
    url: `/api/rooms/${roomId}/join`,
    headers: bearer(boris),
    payload: {},
  })
  const game = await app.inject({
    method: 'POST',
    url: `/api/rooms/${roomId}/games`,
    headers: bearer(anya),
    payload: { scoreLimit },
  })
  return { gameId: game.json().id, anya, boris }
}

async function addEntry(
  app: FastifyInstance,
  gameId: string,
  actor: Guest,
  userId: string,
  points: number,
): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: `/api/games/${gameId}/entries`,
    headers: bearer(actor),
    payload: { id: randomUUID(), userId, points },
  })
  return res.json().entry.id
}

describe('POST /api/entries/:id/void', () => {
  it('отменяет свою запись и убирает её из счёта', async () => {
    const { gameId, boris } = await tableOfTwo(ctx.app)
    const entryId = await addEntry(ctx.app, gameId, boris, boris.user.id, 12)

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/entries/${entryId}/void`,
      headers: bearer(boris),
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().scores[boris.user.id]).toBe(0)
  })

  it('сохраняет отменённую запись в журнале', async () => {
    const { gameId, boris } = await tableOfTwo(ctx.app)
    const entryId = await addEntry(ctx.app, gameId, boris, boris.user.id, 12)

    await ctx.app.inject({
      method: 'POST',
      url: `/api/entries/${entryId}/void`,
      headers: bearer(boris),
    })

    const row = ctx.db
      .prepare('SELECT voided_at, voided_by FROM score_entries WHERE id = ?')
      .get(entryId) as { voided_at: number; voided_by: string }
    expect(row.voided_at).toEqual(expect.any(Number))
    expect(row.voided_by).toBe(boris.user.id)
  })

  it('запрещает обычному игроку отменять чужую запись', async () => {
    const { gameId, anya, boris } = await tableOfTwo(ctx.app)
    const entryId = await addEntry(ctx.app, gameId, anya, anya.user.id, 12)

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/entries/${entryId}/void`,
      headers: bearer(boris),
    })

    expect(res.statusCode).toBe(403)
  })

  it('разрешает хосту отменить чужую запись', async () => {
    const { gameId, anya, boris } = await tableOfTwo(ctx.app)
    const entryId = await addEntry(ctx.app, gameId, boris, boris.user.id, 12)

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/entries/${entryId}/void`,
      headers: bearer(anya),
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().scores[boris.user.id]).toBe(0)
  })

  it('повторная отмена не меняет автора и время отмены', async () => {
    const { gameId, anya, boris } = await tableOfTwo(ctx.app)
    const entryId = await addEntry(ctx.app, gameId, boris, boris.user.id, 12)
    await ctx.app.inject({
      method: 'POST',
      url: `/api/entries/${entryId}/void`,
      headers: bearer(boris),
    })
    const before = ctx.db
      .prepare('SELECT voided_at, voided_by FROM score_entries WHERE id = ?')
      .get(entryId)

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/entries/${entryId}/void`,
      headers: bearer(anya),
    })

    expect(res.statusCode).toBe(200)
    const after = ctx.db
      .prepare('SELECT voided_at, voided_by FROM score_entries WHERE id = ?')
      .get(entryId)
    expect(after).toEqual(before)
  })

  it('отвечает 404 на несуществующую запись', async () => {
    const boris = await createGuestSession(ctx.app, 'Борис')

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/entries/нет-такой/void',
      headers: bearer(boris),
    })

    expect(res.statusCode).toBe(404)
  })
})

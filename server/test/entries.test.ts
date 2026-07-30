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

describe('POST /api/games/:id/entries', () => {
  it('записывает очки себе', async () => {
    const { gameId, boris } = await tableOfTwo(ctx.app)

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/games/${gameId}/entries`,
      headers: bearer(boris),
      payload: { id: randomUUID(), userId: boris.user.id, points: 12 },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().entry).toEqual({
      seq: expect.any(Number),
      id: expect.any(String),
      gameId,
      userId: boris.user.id,
      points: 12,
      createdBy: boris.user.id,
      createdAt: expect.any(Number),
      voidedAt: null,
      voidedBy: null,
    })
    expect(res.json().scores[boris.user.id]).toBe(12)
  })

  it('повторный запрос с тем же id не добавляет вторую запись', async () => {
    const { gameId, boris } = await tableOfTwo(ctx.app)
    const entryId = randomUUID()
    const payload = { id: entryId, userId: boris.user.id, points: 12 }

    await ctx.app.inject({
      method: 'POST',
      url: `/api/games/${gameId}/entries`,
      headers: bearer(boris),
      payload,
    })
    const second = await ctx.app.inject({
      method: 'POST',
      url: `/api/games/${gameId}/entries`,
      headers: bearer(boris),
      payload,
    })

    expect(second.statusCode).toBe(200)
    expect(second.json().scores[boris.user.id]).toBe(12)
    const count = ctx.db
      .prepare('SELECT COUNT(*) AS n FROM score_entries WHERE game_id = ?')
      .get(gameId) as { n: number }
    expect(count.n).toBe(1)
  })

  it('принимает отрицательные очки', async () => {
    const { gameId, boris } = await tableOfTwo(ctx.app)
    await ctx.app.inject({
      method: 'POST',
      url: `/api/games/${gameId}/entries`,
      headers: bearer(boris),
      payload: { id: randomUUID(), userId: boris.user.id, points: 20 },
    })

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/games/${gameId}/entries`,
      headers: bearer(boris),
      payload: { id: randomUUID(), userId: boris.user.id, points: -5 },
    })

    expect(res.json().scores[boris.user.id]).toBe(15)
  })

  it('отклоняет ноль очков', async () => {
    const { gameId, boris } = await tableOfTwo(ctx.app)

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/games/${gameId}/entries`,
      headers: bearer(boris),
      payload: { id: randomUUID(), userId: boris.user.id, points: 0 },
    })

    expect(res.statusCode).toBe(400)
  })

  it('запрещает обычному игроку писать очки другому', async () => {
    const { gameId, anya, boris } = await tableOfTwo(ctx.app)

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/games/${gameId}/entries`,
      headers: bearer(boris),
      payload: { id: randomUUID(), userId: anya.user.id, points: 12 },
    })

    expect(res.statusCode).toBe(403)
  })

  it('разрешает хосту исправить чужой счёт', async () => {
    const { gameId, anya, boris } = await tableOfTwo(ctx.app)

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/games/${gameId}/entries`,
      headers: bearer(anya),
      payload: { id: randomUUID(), userId: boris.user.id, points: 12 },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().entry.createdBy).toBe(anya.user.id)
    expect(res.json().entry.userId).toBe(boris.user.id)
  })

  it('запрещает запись постороннему', async () => {
    const { gameId } = await tableOfTwo(ctx.app)
    const chuzhoj = await createGuestSession(ctx.app, 'Посторонний')

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/games/${gameId}/entries`,
      headers: bearer(chuzhoj),
      payload: { id: randomUUID(), userId: chuzhoj.user.id, points: 12 },
    })

    expect(res.statusCode).toBe(403)
  })

  it('отвечает 404 на несуществующую игру', async () => {
    const boris = await createGuestSession(ctx.app, 'Борис')

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/games/нет-такой/entries',
      headers: bearer(boris),
      payload: { id: randomUUID(), userId: boris.user.id, points: 12 },
    })

    expect(res.statusCode).toBe(404)
  })
})

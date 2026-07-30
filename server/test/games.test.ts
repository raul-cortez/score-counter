import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
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

async function roomWithTwoPlayers(app: FastifyInstance): Promise<{
  roomId: string
  anya: Guest
  boris: Guest
}> {
  const anya = await createGuestSession(app, 'Аня')
  const boris = await createGuestSession(app, 'Борис')
  const created = await app.inject({
    method: 'POST',
    url: '/api/rooms',
    headers: bearer(anya),
    payload: { name: 'Вечер преферанса' },
  })
  const roomId = created.json().id
  await app.inject({
    method: 'POST',
    url: `/api/rooms/${roomId}/join`,
    headers: bearer(boris),
    payload: {},
  })
  return { roomId, anya, boris }
}

describe('POST /api/rooms/:id/games', () => {
  it('стартует игру и фиксирует состав из текущих участников', async () => {
    const { roomId, anya, boris } = await roomWithTwoPlayers(ctx.app)

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${roomId}/games`,
      headers: bearer(anya),
      payload: { scoreLimit: 100 },
    })

    expect(res.statusCode).toBe(200)
    const game = res.json()
    expect(game).toEqual({
      id: expect.any(String),
      roomId,
      scoreLimit: 100,
      status: 'active',
      startedAt: expect.any(Number),
      finishedAt: null,
      winnerUserId: null,
      // Порядок мест зависит от времени входа, которое здесь совпадает до миллисекунды.
      playerIds: expect.arrayContaining([anya.user.id, boris.user.id]),
    })
    expect(game.playerIds).toHaveLength(2)
  })

  it('выдаёт один и тот же порядок мест при повторных стартах', async () => {
    const { roomId, anya } = await roomWithTwoPlayers(ctx.app)
    const first = await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${roomId}/games`,
      headers: bearer(anya),
      payload: { scoreLimit: 100 },
    })
    ctx.db.prepare(`UPDATE games SET status = 'finished' WHERE id = ?`).run(first.json().id)

    const second = await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${roomId}/games`,
      headers: bearer(anya),
      payload: { scoreLimit: 100 },
    })

    expect(second.json().playerIds).toEqual(first.json().playerIds)
  })

  it('запрещает старт не-хосту', async () => {
    const { roomId, boris } = await roomWithTwoPlayers(ctx.app)

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${roomId}/games`,
      headers: bearer(boris),
      payload: { scoreLimit: 100 },
    })

    expect(res.statusCode).toBe(403)
  })

  it('запрещает вторую активную игру в комнате', async () => {
    const { roomId, anya } = await roomWithTwoPlayers(ctx.app)
    await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${roomId}/games`,
      headers: bearer(anya),
      payload: { scoreLimit: 100 },
    })

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${roomId}/games`,
      headers: bearer(anya),
      payload: { scoreLimit: 100 },
    })

    expect(res.statusCode).toBe(409)
  })

  it('требует минимум двух игроков', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')
    const created = await ctx.app.inject({
      method: 'POST',
      url: '/api/rooms',
      headers: bearer(anya),
      payload: { name: 'Одиночество' },
    })

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${created.json().id}/games`,
      headers: bearer(anya),
      payload: { scoreLimit: 100 },
    })

    expect(res.statusCode).toBe(400)
  })

  it('отклоняет лимит вне диапазона', async () => {
    const { roomId, anya } = await roomWithTwoPlayers(ctx.app)

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${roomId}/games`,
      headers: bearer(anya),
      payload: { scoreLimit: 0 },
    })

    expect(res.statusCode).toBe(400)
  })

  it('не включает в состав ушедшего участника', async () => {
    const { roomId, anya, boris } = await roomWithTwoPlayers(ctx.app)
    const vera = await createGuestSession(ctx.app, 'Вера')
    await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${roomId}/join`,
      headers: bearer(vera),
      payload: {},
    })
    await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${roomId}/leave`,
      headers: bearer(vera),
    })

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${roomId}/games`,
      headers: bearer(anya),
      payload: { scoreLimit: 100 },
    })

    expect(res.json().playerIds).toEqual(
      expect.arrayContaining([anya.user.id, boris.user.id]),
    )
    expect(res.json().playerIds).toHaveLength(2)
  })
})

describe('GET /api/games/:id', () => {
  it('отдаёт игру со счётом по каждому игроку', async () => {
    const { roomId, anya, boris } = await roomWithTwoPlayers(ctx.app)
    const started = await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${roomId}/games`,
      headers: bearer(anya),
      payload: { scoreLimit: 100 },
    })

    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/games/${started.json().id}`,
      headers: bearer(boris),
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().scores).toEqual({ [anya.user.id]: 0, [boris.user.id]: 0 })
    expect(res.json().entries).toEqual([])
  })

  it('не отдаёт игру постороннему', async () => {
    const { roomId, anya } = await roomWithTwoPlayers(ctx.app)
    const started = await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${roomId}/games`,
      headers: bearer(anya),
      payload: { scoreLimit: 100 },
    })
    const chuzhoj = await createGuestSession(ctx.app, 'Посторонний')

    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/games/${started.json().id}`,
      headers: bearer(chuzhoj),
    })

    expect(res.statusCode).toBe(403)
  })
})

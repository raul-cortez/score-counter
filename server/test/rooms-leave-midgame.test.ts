import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import { makeApp, closeApp, createGuestSession, bearer, type TestApp } from './helpers.js'

let ctx: TestApp

beforeEach(async () => {
  ctx = await makeApp()
})

afterEach(async () => {
  await closeApp(ctx)
})

describe('выход из комнаты во время игры', () => {
  it('сохраняет игрока в составе и его очки в счёте', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')
    const boris = await createGuestSession(ctx.app, 'Борис')
    const room = await ctx.app.inject({
      method: 'POST',
      url: '/api/rooms',
      headers: bearer(anya),
      payload: { name: 'Вечер преферанса' },
    })
    const roomCode = room.json().room.code
    await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${roomCode}/join`,
      headers: bearer(boris),
      payload: {},
    })
    const game = await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${roomCode}/games`,
      headers: bearer(anya),
      payload: { scoreLimit: 100 },
    })
    const gameId = game.json().game.id
    await ctx.app.inject({
      method: 'POST',
      url: `/api/games/${gameId}/entries`,
      headers: bearer(boris),
      payload: { id: randomUUID(), userId: boris.user.id, points: 30 },
    })

    await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${roomCode}/leave`,
      headers: bearer(boris),
    })

    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/rooms/${roomCode}/state`,
      headers: bearer(anya),
    })
    // Из комнаты ушёл, из состава игры — нет: очки и место остаются за ним.
    expect(res.json().members.map((m: { id: string }) => m.id)).not.toContain(boris.user.id)
    expect(res.json().game.players.map((p: { id: string }) => p.id)).toContain(boris.user.id)
    expect(res.json().game.scores[boris.user.id]).toBe(30)
  })

  it('позволяет вернувшемуся игроку снова писать очки', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')
    const boris = await createGuestSession(ctx.app, 'Борис')
    const room = await ctx.app.inject({
      method: 'POST',
      url: '/api/rooms',
      headers: bearer(anya),
      payload: { name: 'Вечер преферанса' },
    })
    const roomCode = room.json().room.code
    await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${roomCode}/join`,
      headers: bearer(boris),
      payload: {},
    })
    const game = await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${roomCode}/games`,
      headers: bearer(anya),
      payload: { scoreLimit: 100 },
    })
    await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${roomCode}/leave`,
      headers: bearer(boris),
    })
    await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${roomCode}/join`,
      headers: bearer(boris),
      payload: {},
    })

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/games/${game.json().game.id}/entries`,
      headers: bearer(boris),
      payload: { id: randomUUID(), userId: boris.user.id, points: 10 },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().game.scores[boris.user.id]).toBe(10)
  })
})

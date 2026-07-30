import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { makeApp, closeApp, createGuestSession, bearer, type TestApp } from './helpers.js'

let ctx: TestApp

beforeEach(async () => {
  ctx = await makeApp()
})

afterEach(async () => {
  await closeApp(ctx)
})

describe('GET /api/me', () => {
  it('не называет комнату тому, кто никуда не входил', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/me',
      headers: bearer(anya),
    })

    expect(res.json()).toEqual({
      id: anya.user.id,
      nickname: 'Аня',
      hasEmail: false,
      activeRoomCode: null,
    })
  })

  it('называет комнату, в которой человек состоит', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')
    const created = await ctx.app.inject({
      method: 'POST',
      url: '/api/rooms',
      headers: bearer(anya),
      payload: { name: 'Преферанс' },
    })

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/me',
      headers: bearer(anya),
    })

    expect(res.json().activeRoomCode).toBe(created.json().room.code)
  })

  it('забывает комнату после выхода', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')
    const created = await ctx.app.inject({
      method: 'POST',
      url: '/api/rooms',
      headers: bearer(anya),
      payload: { name: 'Преферанс' },
    })
    await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${created.json().room.code}/leave`,
      headers: bearer(anya),
    })

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/me',
      headers: bearer(anya),
    })

    expect(res.json().activeRoomCode).toBeNull()
  })

  it('называет последнюю комнату, если человек в нескольких', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')
    await ctx.app.inject({
      method: 'POST',
      url: '/api/rooms',
      headers: bearer(anya),
      payload: { name: 'Первая' },
    })
    const second = await ctx.app.inject({
      method: 'POST',
      url: '/api/rooms',
      headers: bearer(anya),
      payload: { name: 'Вторая' },
    })

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/me',
      headers: bearer(anya),
    })

    expect(res.json().activeRoomCode).toBe(second.json().room.code)
  })

  it('забывает закрытую комнату', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')
    const created = await ctx.app.inject({
      method: 'POST',
      url: '/api/rooms',
      headers: bearer(anya),
      payload: { name: 'Вчерашняя' },
    })
    ctx.db
      .prepare('UPDATE rooms SET closed_at = ? WHERE code = ?')
      .run(Date.now(), created.json().room.code)

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/me',
      headers: bearer(anya),
    })

    expect(res.json().activeRoomCode).toBeNull()
  })
})

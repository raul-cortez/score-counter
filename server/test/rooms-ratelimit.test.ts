import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { makeApp, closeApp, createGuestSession, bearer, type TestApp } from './helpers.js'

let ctx: TestApp

beforeEach(async () => {
  ctx = await makeApp()
})

afterEach(async () => {
  await closeApp(ctx)
})

describe('ограничение попыток входа', () => {
  it('блокирует после 10 неверных паролей подряд', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')
    const boris = await createGuestSession(ctx.app, 'Борис')
    const room = await ctx.app.inject({
      method: 'POST',
      url: '/api/rooms',
      headers: bearer(anya),
      payload: { name: 'Закрытая', password: 'дружеский' },
    })
    const roomId = room.json().id

    const codes: number[] = []
    for (let attempt = 0; attempt < 12; attempt++) {
      const res = await ctx.app.inject({
        method: 'POST',
        url: `/api/rooms/${roomId}/join`,
        headers: bearer(boris),
        payload: { password: `подбор-${attempt}` },
      })
      codes.push(res.statusCode)
    }

    expect(codes.slice(0, 10)).toEqual(Array(10).fill(403))
    expect(codes.at(-1)).toBe(429)
  })

  it('не мешает входить в другую комнату', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')
    const boris = await createGuestSession(ctx.app, 'Борис')
    const closed = await ctx.app.inject({
      method: 'POST',
      url: '/api/rooms',
      headers: bearer(anya),
      payload: { name: 'Закрытая', password: 'дружеский' },
    })
    const open = await ctx.app.inject({
      method: 'POST',
      url: '/api/rooms',
      headers: bearer(anya),
      payload: { name: 'Открытая' },
    })

    for (let attempt = 0; attempt < 12; attempt++) {
      await ctx.app.inject({
        method: 'POST',
        url: `/api/rooms/${closed.json().id}/join`,
        headers: bearer(boris),
        payload: { password: `подбор-${attempt}` },
      })
    }

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${open.json().id}/join`,
      headers: bearer(boris),
      payload: {},
    })

    expect(res.statusCode).toBe(200)
  })
})

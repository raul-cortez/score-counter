import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { makeApp, closeApp, createGuestSession, bearer, type TestApp } from './helpers.js'

let ctx: TestApp

beforeEach(async () => {
  ctx = await makeApp()
})

afterEach(async () => {
  await closeApp(ctx)
})

async function makeRoom(token: string, payload: { name: string; password?: string }) {
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/api/rooms',
    headers: { authorization: `Bearer ${token}` },
    payload,
  })
  return res.json()
}

describe('вход по коду одним запросом', () => {
  it('пускает в комнату по коду и паролю сразу', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')
    const boris = await createGuestSession(ctx.app, 'Борис')
    const room = await makeRoom(anya.token, { name: 'Закрытая', password: 'секрет' })

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${room.room.code}/join`,
      headers: bearer(boris),
      payload: { password: 'секрет' },
    })

    expect(res.statusCode).toBe(200)
    expect(
      res
        .json()
        .members.map((m: { nickname: string }) => m.nickname)
        .sort(),
    ).toEqual(['Аня', 'Борис'])
  })

  it('принимает код в нижнем регистре', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')
    const boris = await createGuestSession(ctx.app, 'Борис')
    const room = await makeRoom(anya.token, { name: 'Открытая' })

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${room.room.code.toLowerCase()}/join`,
      headers: bearer(boris),
      payload: {},
    })

    expect(res.statusCode).toBe(200)
  })

  it('отдаёт сводку по коду любому авторизованному до входа', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')
    const boris = await createGuestSession(ctx.app, 'Борис')
    const room = await makeRoom(anya.token, { name: 'Закрытая', password: 'секрет' })

    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/rooms/${room.room.code}`,
      headers: bearer(boris),
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({
      id: expect.any(String),
      code: room.room.code,
      name: 'Закрытая',
      hasPassword: true,
      hostUserId: anya.user.id,
      memberCount: 1,
      gameActive: false,
    })
  })

  it('не отдаёт полное состояние не участнику', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')
    const chuzhoj = await createGuestSession(ctx.app, 'Посторонний')
    const room = await makeRoom(anya.token, { name: 'Открытая' })

    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/rooms/${room.room.code}/state`,
      headers: bearer(chuzhoj),
    })

    expect(res.statusCode).toBe(403)
  })

  it('отдаёт полное состояние участнику', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')
    const room = await makeRoom(anya.token, { name: 'Открытая' })

    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/rooms/${room.room.code}/state`,
      headers: bearer(anya),
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().room.hostUserId).toBe(anya.user.id)
    expect(res.json().members).toHaveLength(1)
    expect(res.json().game).toBeNull()
  })

  it('отвечает 404 на неизвестный код', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/rooms/ZZZZZZ/join',
      headers: bearer(anya),
      payload: {},
    })

    expect(res.statusCode).toBe(404)
  })
})

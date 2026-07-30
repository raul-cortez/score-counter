import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { makeApp, closeApp, createGuestSession, bearer, type TestApp } from './helpers.js'

let ctx: TestApp

beforeEach(async () => {
  ctx = await makeApp()
})

afterEach(async () => {
  await closeApp(ctx)
})

describe('POST /api/rooms', () => {
  it('создаёт комнату и делает автора хостом и участником', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/rooms',
      headers: bearer(anya),
      payload: { name: 'Вечер преферанса' },
    })

    expect(res.statusCode).toBe(200)
    const state = res.json()
    expect(state.room).toEqual({
      id: expect.any(String),
      code: expect.stringMatching(/^[A-Z2-9]{6}$/),
      name: 'Вечер преферанса',
      hasPassword: false,
      hostUserId: anya.user.id,
    })
    expect(state.members).toEqual([{ id: anya.user.id, nickname: 'Аня', hasEmail: false }])
    expect(state.game).toBeNull()

    const membership = ctx.db
      .prepare('SELECT user_id FROM room_members WHERE room_id = ?')
      .all(state.room.id)
    expect(membership).toEqual([{ user_id: anya.user.id }])
  })

  it('не возвращает пароль и хранит его хэшем', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/rooms',
      headers: bearer(anya),
      payload: { name: 'Закрытая', password: 'дружеский' },
    })

    expect(res.json().room.hasPassword).toBe(true)
    expect(res.body).not.toContain('дружеский')

    const row = ctx.db
      .prepare('SELECT password_hash FROM rooms WHERE id = ?')
      .get(res.json().room.id) as { password_hash: string }
    expect(row.password_hash.startsWith('$argon2')).toBe(true)
  })

  it('отклоняет пустое имя', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/rooms',
      headers: bearer(anya),
      payload: { name: '' },
    })

    expect(res.statusCode).toBe(400)
  })

  it('требует авторизации', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/rooms',
      payload: { name: 'Вечер преферанса' },
    })

    expect(res.statusCode).toBe(401)
  })
})

describe('GET /api/rooms', () => {
  it('показывает открытые комнаты с признаком пароля, но без него самого', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')
    await ctx.app.inject({
      method: 'POST',
      url: '/api/rooms',
      headers: bearer(anya),
      payload: { name: 'Открытая' },
    })
    await ctx.app.inject({
      method: 'POST',
      url: '/api/rooms',
      headers: bearer(anya),
      payload: { name: 'Закрытая', password: 'дружеский' },
    })

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/rooms',
      headers: bearer(anya),
    })

    expect(res.statusCode).toBe(200)
    const names = res.json().map((room: { name: string }) => room.name)
    expect(names).toEqual(expect.arrayContaining(['Открытая', 'Закрытая']))
    expect(res.body).not.toContain('дружеский')
  })

  it('не показывает закрытые комнаты', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')
    const created = await ctx.app.inject({
      method: 'POST',
      url: '/api/rooms',
      headers: bearer(anya),
      payload: { name: 'Вчерашняя' },
    })
    ctx.db
      .prepare('UPDATE rooms SET closed_at = ? WHERE id = ?')
      .run(Date.now(), created.json().room.id)

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/rooms',
      headers: bearer(anya),
    })

    expect(res.json()).toEqual([])
  })

  it('требует авторизации', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/rooms' })

    expect(res.statusCode).toBe(401)
  })
})

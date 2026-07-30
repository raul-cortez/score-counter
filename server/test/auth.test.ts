import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { makeApp, closeApp, createGuestSession, bearer, type TestApp } from './helpers.js'

let ctx: TestApp

beforeEach(async () => {
  ctx = await makeApp()
})

afterEach(async () => {
  await closeApp(ctx)
})

describe('POST /api/auth/guest', () => {
  it('заводит гостя и выдаёт токен', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/guest',
      payload: { nickname: 'Аня' },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.token).toEqual(expect.any(String))
    expect(body.user).toEqual({
      id: expect.any(String),
      nickname: 'Аня',
      hasEmail: false,
    })
  })

  it('отклоняет пустой ник', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/guest',
      payload: { nickname: '' },
    })

    expect(res.statusCode).toBe(400)
  })

  it('отклоняет ник длиннее 20 символов', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/guest',
      payload: { nickname: 'я'.repeat(21) },
    })

    expect(res.statusCode).toBe(400)
  })

  it('не хранит сырой токен в базе', async () => {
    const guest = await createGuestSession(ctx.app, 'Аня')

    const row = ctx.db
      .prepare('SELECT token_hash FROM sessions')
      .get() as { token_hash: string }

    expect(row.token_hash).not.toBe(guest.token)
  })
})

describe('GET /api/me', () => {
  it('возвращает текущего пользователя по токену', async () => {
    const guest = await createGuestSession(ctx.app, 'Аня')

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/me',
      headers: bearer(guest),
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual(guest.user)
  })

  it('отвечает 401 без токена', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/me' })

    expect(res.statusCode).toBe(401)
  })

  it('отвечает 401 на неизвестный токен', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { authorization: 'Bearer выдуманный' },
    })

    expect(res.statusCode).toBe(401)
  })
})

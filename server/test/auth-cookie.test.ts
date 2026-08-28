import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { makeApp, closeApp, type TestApp } from './helpers.js'

let ctx: TestApp

beforeEach(async () => {
  ctx = await makeApp()
})

afterEach(async () => {
  await closeApp(ctx)
})

/**
 * Резервный канал опознания рядом с Bearer-токеном — см. server/src/auth/cookies.ts.
 * Здесь проверяется путь целиком: без него в тестах остаётся только модульная
 * проверка разбора заголовка, а реальный обрыв случается на стыке с requireAuth.
 */
describe('резервная кука сессии', () => {
  it('выставляется при входе гостем', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/guest',
      payload: { nickname: 'Аня' },
    })

    const cookie = res.headers['set-cookie']
    expect(cookie).toContain(`sid=${res.json().token}`)
    expect(cookie).toContain('HttpOnly')
  })

  it('опознаёт по одной только куке, без заголовка Authorization', async () => {
    const guest = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/guest',
      payload: { nickname: 'Аня' },
    })

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { cookie: `sid=${guest.json().token}` },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().nickname).toBe('Аня')
  })

  it('продлевает куку на каждом обращении к /api/me', async () => {
    const guest = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/guest',
      payload: { nickname: 'Аня' },
    })

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { cookie: `sid=${guest.json().token}` },
    })

    expect(res.headers['set-cookie']).toContain(`sid=${guest.json().token}`)
  })

  it('без токена нигде — обычные 401, не 500', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/me' })

    expect(res.statusCode).toBe(401)
  })
})

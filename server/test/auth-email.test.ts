import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { makeApp, closeApp, createGuestSession, bearer, type TestApp } from './helpers.js'

let ctx: TestApp

beforeEach(async () => {
  ctx = await makeApp()
})

afterEach(async () => {
  await closeApp(ctx)
})

describe('POST /api/auth/upgrade', () => {
  it('привязывает email к текущему гостю, сохраняя его id', async () => {
    const guest = await createGuestSession(ctx.app, 'Аня')

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/upgrade',
      headers: bearer(guest),
      payload: { email: 'anya@example.com', password: 'очень-секретно' },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({
      id: guest.user.id,
      nickname: 'Аня',
      hasEmail: true,
    })
  })

  it('не хранит пароль в открытом виде', async () => {
    const guest = await createGuestSession(ctx.app, 'Аня')
    await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/upgrade',
      headers: bearer(guest),
      payload: { email: 'anya@example.com', password: 'очень-секретно' },
    })

    const row = ctx.db
      .prepare('SELECT password_hash FROM users WHERE id = ?')
      .get(guest.user.id) as { password_hash: string }

    expect(row.password_hash).not.toContain('очень-секретно')
    expect(row.password_hash.startsWith('$argon2')).toBe(true)
  })

  it('отклоняет занятый email', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')
    await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/upgrade',
      headers: bearer(anya),
      payload: { email: 'anya@example.com', password: 'очень-секретно' },
    })
    const boris = await createGuestSession(ctx.app, 'Борис')

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/upgrade',
      headers: bearer(boris),
      payload: { email: 'anya@example.com', password: 'другой-пароль' },
    })

    expect(res.statusCode).toBe(409)
  })

  it('отклоняет короткий пароль', async () => {
    const guest = await createGuestSession(ctx.app, 'Аня')

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/upgrade',
      headers: bearer(guest),
      payload: { email: 'anya@example.com', password: 'корот' },
    })

    expect(res.statusCode).toBe(400)
  })

  it('требует авторизации', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/upgrade',
      payload: { email: 'anya@example.com', password: 'очень-секретно' },
    })

    expect(res.statusCode).toBe(401)
  })
})

describe('POST /api/auth/login', () => {
  it('выдаёт новый токен для того же пользователя', async () => {
    const guest = await createGuestSession(ctx.app, 'Аня')
    await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/upgrade',
      headers: bearer(guest),
      payload: { email: 'anya@example.com', password: 'очень-секретно' },
    })

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'anya@example.com', password: 'очень-секретно' },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.user.id).toBe(guest.user.id)
    expect(body.token).not.toBe(guest.token)
  })

  it('отклоняет неверный пароль', async () => {
    const guest = await createGuestSession(ctx.app, 'Аня')
    await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/upgrade',
      headers: bearer(guest),
      payload: { email: 'anya@example.com', password: 'очень-секретно' },
    })

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'anya@example.com', password: 'неправильный' },
    })

    expect(res.statusCode).toBe(401)
  })

  it('отклоняет неизвестный email', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'nobody@example.com', password: 'очень-секретно' },
    })

    expect(res.statusCode).toBe(401)
  })

  it('отклоняет адрес, не похожий на email', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'вообще-не-адрес', password: 'очень-секретно' },
    })

    expect(res.statusCode).toBe(400)
  })
})

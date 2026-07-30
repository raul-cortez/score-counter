import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { makeApp, closeApp, createGuestSession, bearer, type TestApp } from './helpers.js'
import { openDb } from '../src/db/index.js'
import { buildApp } from '../src/app.js'

let ctx: TestApp

beforeEach(async () => {
  ctx = await makeApp()
})

afterEach(async () => {
  await closeApp(ctx)
})

describe('форма ошибок', () => {
  it('у ошибки валидации есть error и message', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/rooms',
      headers: bearer(anya),
      payload: { name: '' },
    })

    expect(res.statusCode).toBe(400)
    expect(res.json()).toEqual({
      error: 'validation_failed',
      message: expect.any(String),
    })
  })

  it('у доменной ошибки есть error', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/me' })

    expect(res.statusCode).toBe(401)
    expect(res.json().error).toBe('unauthorized')
  })

  it('у ненайденного маршрута есть error', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/такого-нет' })

    expect(res.statusCode).toBe(404)
    expect(res.json().error).toBe('not_found')
  })

  it('не протекает внутренностями наружу при сбое', async () => {
    // Своё приложение: маршрут нужно объявить до ready(), а makeApp его уже вызвал.
    const db = openDb(':memory:')
    const app = buildApp(db)
    app.get('/api/взорвись', async () => {
      throw new Error('пароль от базы: секрет')
    })
    await app.ready()

    const res = await app.inject({ method: 'GET', url: '/api/взорвись' })

    expect(res.statusCode).toBe(500)
    expect(res.json()).toEqual({ error: 'internal_error', message: expect.any(String) })
    expect(res.body).not.toContain('пароль от базы')

    await app.close()
    db.close()
  })
})

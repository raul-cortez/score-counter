import { describe, it, expect } from 'vitest'
import { makeApp, closeApp } from './helpers.js'

describe('GET /api/health', () => {
  it('отвечает ok', async () => {
    const ctx = await makeApp()

    const res = await ctx.app.inject({ method: 'GET', url: '/api/health' })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ status: 'ok' })
    await closeApp(ctx)
  })
})

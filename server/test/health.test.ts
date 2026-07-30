import { describe, it, expect } from 'vitest'
import { buildApp } from '../src/app.js'

describe('GET /api/health', () => {
  it('отвечает ok', async () => {
    const app = buildApp()
    await app.ready()

    const res = await app.inject({ method: 'GET', url: '/api/health' })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ status: 'ok' })
    await app.close()
  })
})

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import {
  makeApp,
  closeApp,
  createGuestSession,
  bearer,
  type TestApp,
  type Guest,
} from './helpers.js'

let ctx: TestApp

beforeEach(async () => {
  ctx = await makeApp()
})

afterEach(async () => {
  await closeApp(ctx)
})

async function createRoom(
  app: FastifyInstance,
  host: Guest,
  payload: { name: string; password?: string },
): Promise<{ id: string; code: string }> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/rooms',
    headers: bearer(host),
    payload,
  })
  return res.json().room
}

describe('POST /api/rooms/:code/join', () => {
  it('пускает в комнату без пароля', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')
    const boris = await createGuestSession(ctx.app, 'Борис')
    const room = await createRoom(ctx.app, anya, { name: 'Открытая' })

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${room.code}/join`,
      headers: bearer(boris),
      payload: {},
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().members).toHaveLength(2)
  })

  it('пускает по верному паролю', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')
    const boris = await createGuestSession(ctx.app, 'Борис')
    const room = await createRoom(ctx.app, anya, { name: 'Закрытая', password: 'дружеский' })

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${room.code}/join`,
      headers: bearer(boris),
      payload: { password: 'дружеский' },
    })

    expect(res.statusCode).toBe(200)
  })

  it('отклоняет неверный пароль', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')
    const boris = await createGuestSession(ctx.app, 'Борис')
    const room = await createRoom(ctx.app, anya, { name: 'Закрытая', password: 'дружеский' })

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${room.code}/join`,
      headers: bearer(boris),
      payload: { password: 'подобранный' },
    })

    expect(res.statusCode).toBe(403)
  })

  it('отклоняет вход в защищённую комнату без пароля', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')
    const boris = await createGuestSession(ctx.app, 'Борис')
    const room = await createRoom(ctx.app, anya, { name: 'Закрытая', password: 'дружеский' })

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${room.code}/join`,
      headers: bearer(boris),
      payload: {},
    })

    expect(res.statusCode).toBe(403)
  })

  it('повторный вход не создаёт второго участника', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')
    const boris = await createGuestSession(ctx.app, 'Борис')
    const room = await createRoom(ctx.app, anya, { name: 'Открытая' })

    await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${room.code}/join`,
      headers: bearer(boris),
      payload: {},
    })
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${room.code}/join`,
      headers: bearer(boris),
      payload: {},
    })

    expect(res.json().members).toHaveLength(2)
  })

  it('отвечает 404 на несуществующую комнату', async () => {
    const boris = await createGuestSession(ctx.app, 'Борис')

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/rooms/QQQQQQ/join',
      headers: bearer(boris),
      payload: {},
    })

    expect(res.statusCode).toBe(404)
  })
})

describe('POST /api/rooms/:code/leave', () => {
  it('убирает участника из комнаты', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')
    const boris = await createGuestSession(ctx.app, 'Борис')
    const room = await createRoom(ctx.app, anya, { name: 'Открытая' })
    await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${room.code}/join`,
      headers: bearer(boris),
      payload: {},
    })

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${room.code}/leave`,
      headers: bearer(boris),
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().members).toHaveLength(1)
  })
})

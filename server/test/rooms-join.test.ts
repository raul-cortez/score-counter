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
  return res.json()
}

describe('POST /api/rooms/:id/join', () => {
  it('пускает в комнату без пароля', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')
    const boris = await createGuestSession(ctx.app, 'Борис')
    const room = await createRoom(ctx.app, anya, { name: 'Открытая' })

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${room.id}/join`,
      headers: bearer(boris),
      payload: {},
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().memberCount).toBe(2)
  })

  it('пускает по верному паролю', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')
    const boris = await createGuestSession(ctx.app, 'Борис')
    const room = await createRoom(ctx.app, anya, { name: 'Закрытая', password: 'дружеский' })

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${room.id}/join`,
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
      url: `/api/rooms/${room.id}/join`,
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
      url: `/api/rooms/${room.id}/join`,
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
      url: `/api/rooms/${room.id}/join`,
      headers: bearer(boris),
      payload: {},
    })
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${room.id}/join`,
      headers: bearer(boris),
      payload: {},
    })

    expect(res.json().memberCount).toBe(2)
  })

  it('отвечает 404 на несуществующую комнату', async () => {
    const boris = await createGuestSession(ctx.app, 'Борис')

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/rooms/нет-такой/join',
      headers: bearer(boris),
      payload: {},
    })

    expect(res.statusCode).toBe(404)
  })
})

describe('GET /api/rooms/by-code/:code', () => {
  it('находит комнату по коду для ссылки-приглашения', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')
    const boris = await createGuestSession(ctx.app, 'Борис')
    const room = await createRoom(ctx.app, anya, { name: 'Открытая' })

    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/rooms/by-code/${room.code}`,
      headers: bearer(boris),
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().id).toBe(room.id)
  })

  it('отвечает 404 на неизвестный код', async () => {
    const boris = await createGuestSession(ctx.app, 'Борис')

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/rooms/by-code/ZZZZZZ',
      headers: bearer(boris),
    })

    expect(res.statusCode).toBe(404)
  })
})

describe('POST /api/rooms/:id/leave', () => {
  it('убирает участника из комнаты', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')
    const boris = await createGuestSession(ctx.app, 'Борис')
    const room = await createRoom(ctx.app, anya, { name: 'Открытая' })
    await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${room.id}/join`,
      headers: bearer(boris),
      payload: {},
    })

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${room.id}/leave`,
      headers: bearer(boris),
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().memberCount).toBe(1)
  })
})

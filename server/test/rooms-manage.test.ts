import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { RoomState } from '@score/shared'
import { makeApp, closeApp, createGuestSession, bearer, type TestApp } from './helpers.js'

let ctx: TestApp

beforeEach(async () => {
  ctx = await makeApp()
})

afterEach(async () => {
  await closeApp(ctx)
})

async function makeRoom(host: Awaited<ReturnType<typeof createGuestSession>>) {
  const created = await ctx.app.inject({
    method: 'POST',
    url: '/api/rooms',
    headers: bearer(host),
    payload: { name: 'Преферанс' },
  })
  return (created.json() as RoomState).room.code
}

describe('POST /api/rooms/:code/rename', () => {
  it('хост переименовывает комнату', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')
    const code = await makeRoom(anya)

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${code}/rename`,
      headers: bearer(anya),
      payload: { name: 'Дурак на раздевание' },
    })

    expect(res.statusCode).toBe(200)
    expect((res.json() as RoomState).room.name).toBe('Дурак на раздевание')
  })

  it('не пускает не-хоста', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')
    const boris = await createGuestSession(ctx.app, 'Борис')
    const code = await makeRoom(anya)
    await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${code}/join`,
      headers: bearer(boris),
      payload: {},
    })

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${code}/rename`,
      headers: bearer(boris),
      payload: { name: 'Захват власти' },
    })

    expect(res.statusCode).toBe(403)
  })

  it('отклоняет пустое название', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')
    const code = await makeRoom(anya)

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${code}/rename`,
      headers: bearer(anya),
      payload: { name: '   ' },
    })

    expect(res.statusCode).toBe(400)
  })
})

describe('POST /api/rooms/:code/close', () => {
  it('хост закрывает комнату — она пропадает из открытых и перестаёт открываться', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')
    const code = await makeRoom(anya)

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${code}/close`,
      headers: bearer(anya),
    })
    expect(res.statusCode).toBe(200)

    const list = await ctx.app.inject({ method: 'GET', url: '/api/rooms', headers: bearer(anya) })
    expect(list.json()).toEqual([])

    const state = await ctx.app.inject({
      method: 'GET',
      url: `/api/rooms/${code}/state`,
      headers: bearer(anya),
    })
    expect(state.statusCode).toBe(404)

    const join = await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${code}/join`,
      headers: bearer(anya),
      payload: {},
    })
    expect(join.statusCode).toBe(404)
  })

  it('не пускает не-хоста', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')
    const boris = await createGuestSession(ctx.app, 'Борис')
    const code = await makeRoom(anya)
    await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${code}/join`,
      headers: bearer(boris),
      payload: {},
    })

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${code}/close`,
      headers: bearer(boris),
    })

    expect(res.statusCode).toBe(403)
  })
})

describe('POST /api/rooms/:code/members/:userId/remove', () => {
  it('хост убирает участника', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')
    const boris = await createGuestSession(ctx.app, 'Борис')
    const code = await makeRoom(anya)
    await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${code}/join`,
      headers: bearer(boris),
      payload: {},
    })

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${code}/members/${boris.user.id}/remove`,
      headers: bearer(anya),
    })

    expect(res.statusCode).toBe(200)
    const state = res.json() as RoomState
    expect(state.members.map((m) => m.id)).toEqual([anya.user.id])
  })

  it('не пускает не-хоста', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')
    const boris = await createGuestSession(ctx.app, 'Борис')
    const code = await makeRoom(anya)
    await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${code}/join`,
      headers: bearer(boris),
      payload: {},
    })

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${code}/members/${anya.user.id}/remove`,
      headers: bearer(boris),
    })

    expect(res.statusCode).toBe(403)
  })

  it('не даёт убрать хоста', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')
    const code = await makeRoom(anya)

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${code}/members/${anya.user.id}/remove`,
      headers: bearer(anya),
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().error).toBe('cannot_remove_host')
  })

  it('404 на того, кого в комнате нет', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')
    const stranger = await createGuestSession(ctx.app, 'Чужой')
    const code = await makeRoom(anya)

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${code}/members/${stranger.user.id}/remove`,
      headers: bearer(anya),
    })

    expect(res.statusCode).toBe(404)
  })
})

describe('POST /api/rooms/:code/members/:userId/rename', () => {
  it('хост переименовывает участника — имя меняется глобально', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')
    const boris = await createGuestSession(ctx.app, 'Борис')
    const code = await makeRoom(anya)
    await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${code}/join`,
      headers: bearer(boris),
      payload: {},
    })

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${code}/members/${boris.user.id}/rename`,
      headers: bearer(anya),
      payload: { nickname: 'Боря' },
    })

    expect(res.statusCode).toBe(200)
    const state = res.json() as RoomState
    expect(state.members.find((m) => m.id === boris.user.id)?.nickname).toBe('Боря')

    const me = await ctx.app.inject({ method: 'GET', url: '/api/me', headers: bearer(boris) })
    expect(me.json().nickname).toBe('Боря')
  })

  it('не пускает не-хоста', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')
    const boris = await createGuestSession(ctx.app, 'Борис')
    const code = await makeRoom(anya)
    await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${code}/join`,
      headers: bearer(boris),
      payload: {},
    })

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${code}/members/${anya.user.id}/rename`,
      headers: bearer(boris),
      payload: { nickname: 'Самозванка' },
    })

    expect(res.statusCode).toBe(403)
  })
})

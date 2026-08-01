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

describe('POST /api/me/nickname', () => {
  it('меняет имя и отдаёт его же в /me', async () => {
    const guest = await createGuestSession(ctx.app, 'Аня')

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/me/nickname',
      headers: bearer(guest),
      payload: { nickname: 'Анна Петровна' },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({
      id: guest.user.id,
      nickname: 'Анна Петровна',
      hasEmail: false,
      activeRoomCode: null,
    })

    const me = await ctx.app.inject({ method: 'GET', url: '/api/me', headers: bearer(guest) })
    expect(me.json().nickname).toBe('Анна Петровна')
  })

  it('обрезает пробелы по краям', async () => {
    const guest = await createGuestSession(ctx.app, 'Аня')

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/me/nickname',
      headers: bearer(guest),
      payload: { nickname: '  Аня Б.  ' },
    })

    expect(res.json().nickname).toBe('Аня Б.')
  })

  it('отклоняет имя из одних пробелов', async () => {
    const guest = await createGuestSession(ctx.app, 'Аня')

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/me/nickname',
      headers: bearer(guest),
      payload: { nickname: '   ' },
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().error).toBe('bad_nickname')
  })

  it('не пускает без токена', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/me/nickname',
      payload: { nickname: 'Кто-то' },
    })

    expect(res.statusCode).toBe(401)
  })

  it('новое имя видно в составе комнаты и в записях прошлой партии', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')
    const boris = await createGuestSession(ctx.app, 'Борис')

    const created = await ctx.app.inject({
      method: 'POST',
      url: '/api/rooms',
      headers: bearer(anya),
      payload: { name: 'Преферанс' },
    })
    const code = (created.json() as RoomState).room.code
    await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${code}/join`,
      headers: bearer(boris),
      payload: {},
    })
    const started = await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${code}/games`,
      headers: bearer(anya),
      payload: { scoreLimit: 100 },
    })
    const gameId = (started.json() as RoomState).game!.id
    await ctx.app.inject({
      method: 'POST',
      url: `/api/games/${gameId}/entries`,
      headers: bearer(anya),
      payload: { id: crypto.randomUUID(), userId: anya.user.id, points: 40 },
    })

    await ctx.app.inject({
      method: 'POST',
      url: '/api/me/nickname',
      headers: bearer(anya),
      payload: { nickname: 'Аня Б.' },
    })

    const state = await ctx.app.inject({
      method: 'GET',
      url: `/api/rooms/${code}/state`,
      headers: bearer(boris),
    })
    const body = state.json() as RoomState
    expect(body.members.find((member) => member.id === anya.user.id)?.nickname).toBe('Аня Б.')
    // Игроки партии — тот же список пользователей, поэтому имя меняется и в ней.
    expect(body.game!.players.find((player) => player.id === anya.user.id)?.nickname).toBe('Аня Б.')
  })

  it('в комнате остаётся код активной комнаты', async () => {
    const guest = await createGuestSession(ctx.app, 'Аня')
    const created = await ctx.app.inject({
      method: 'POST',
      url: '/api/rooms',
      headers: bearer(guest),
      payload: { name: 'Дурак' },
    })
    const code = (created.json() as RoomState).room.code

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/me/nickname',
      headers: bearer(guest),
      payload: { nickname: 'Аня Б.' },
    })

    expect(res.json().activeRoomCode).toBe(code)
  })
})

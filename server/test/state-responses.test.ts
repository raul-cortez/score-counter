import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import { makeApp, closeApp, createGuestSession, bearer, type TestApp } from './helpers.js'

let ctx: TestApp

beforeEach(async () => {
  ctx = await makeApp()
})

afterEach(async () => {
  await closeApp(ctx)
})

/** Стор на клиенте должен разбирать одну форму, а не по одной на маршрут. */
function expectRoomState(body: any) {
  expect(Object.keys(body).sort()).toEqual(['game', 'members', 'room'])
  expect(body.room).toEqual(
    expect.objectContaining({ id: expect.any(String), code: expect.any(String) }),
  )
}

async function table() {
  const anya = await createGuestSession(ctx.app, 'Аня')
  const boris = await createGuestSession(ctx.app, 'Борис')
  const created = await ctx.app.inject({
    method: 'POST',
    url: '/api/rooms',
    headers: bearer(anya),
    payload: { name: 'Преферанс' },
  })
  const code = created.json().room.code
  await ctx.app.inject({
    method: 'POST',
    url: `/api/rooms/${code}/join`,
    headers: bearer(boris),
    payload: {},
  })
  return { anya, boris, code }
}

async function startedGame() {
  const { anya, boris, code } = await table()
  const started = await ctx.app.inject({
    method: 'POST',
    url: `/api/rooms/${code}/games`,
    headers: bearer(anya),
    payload: { scoreLimit: 100 },
  })
  return { anya, boris, code, gameId: started.json().game.id }
}

describe('все изменяющие маршруты возвращают состояние комнаты', () => {
  it('создание комнаты', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/rooms',
      headers: bearer(anya),
      payload: { name: 'Преферанс' },
    })

    expectRoomState(res.json())
  })

  it('вход в комнату', async () => {
    const { code, boris } = await table()

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${code}/join`,
      headers: bearer(boris),
      payload: {},
    })

    expectRoomState(res.json())
  })

  it('старт игры', async () => {
    const { code, anya } = await table()

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${code}/games`,
      headers: bearer(anya),
      payload: { scoreLimit: 100 },
    })

    expectRoomState(res.json())
    expect(res.json().game.players).toHaveLength(2)
  })

  it('запись очков', async () => {
    const { gameId, boris } = await startedGame()

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/games/${gameId}/entries`,
      headers: bearer(boris),
      payload: { id: randomUUID(), userId: boris.user.id, points: 12 },
    })

    expectRoomState(res.json())
    expect(res.json().game.scores[boris.user.id]).toBe(12)
  })

  it('отмена записи', async () => {
    const { gameId, boris } = await startedGame()
    const entryId = randomUUID()
    await ctx.app.inject({
      method: 'POST',
      url: `/api/games/${gameId}/entries`,
      headers: bearer(boris),
      payload: { id: entryId, userId: boris.user.id, points: 12 },
    })

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/entries/${entryId}/void`,
      headers: bearer(boris),
    })

    expectRoomState(res.json())
    expect(res.json().game.scores[boris.user.id]).toBe(0)
  })

  it('выход из комнаты', async () => {
    const { code, boris } = await table()

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${code}/leave`,
      headers: bearer(boris),
    })

    expectRoomState(res.json())
  })

  it('чтение состояния комнаты', async () => {
    const { code, anya } = await table()

    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/rooms/${code}/state`,
      headers: bearer(anya),
    })

    expectRoomState(res.json())
  })
})

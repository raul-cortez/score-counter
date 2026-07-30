import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
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

type Table = { roomCode: string; gameId: string; anya: Guest; boris: Guest }

async function tableOfTwo(app: FastifyInstance, scoreLimit: number): Promise<Table> {
  const anya = await createGuestSession(app, 'Аня')
  const boris = await createGuestSession(app, 'Борис')
  const room = await app.inject({
    method: 'POST',
    url: '/api/rooms',
    headers: bearer(anya),
    payload: { name: 'Вечер преферанса' },
  })
  const roomCode = room.json().room.code
  await app.inject({
    method: 'POST',
    url: `/api/rooms/${roomCode}/join`,
    headers: bearer(boris),
    payload: {},
  })
  const game = await app.inject({
    method: 'POST',
    url: `/api/rooms/${roomCode}/games`,
    headers: bearer(anya),
    payload: { scoreLimit },
  })
  return { roomCode, gameId: game.json().game.id, anya, boris }
}

/** Идентификатор записи придумывает клиент, поэтому его можно задать заранее. */
function addEntry(
  app: FastifyInstance,
  gameId: string,
  actor: Guest,
  points: number,
  entryId: string = randomUUID(),
) {
  return app.inject({
    method: 'POST',
    url: `/api/games/${gameId}/entries`,
    headers: bearer(actor),
    payload: { id: entryId, userId: actor.user.id, points },
  })
}

describe('завершение игры', () => {
  it('объявляет победителя при достижении лимита', async () => {
    const { gameId, boris } = await tableOfTwo(ctx.app, 50)

    const res = await addEntry(ctx.app, gameId, boris, 50)

    expect(res.json().game).toEqual(
      expect.objectContaining({
        status: 'finished',
        winnerUserId: boris.user.id,
        finishedAt: expect.any(Number),
      }),
    )
  })

  it('не завершает игру до достижения лимита', async () => {
    const { gameId, boris } = await tableOfTwo(ctx.app, 50)

    const res = await addEntry(ctx.app, gameId, boris, 49)

    expect(res.json().game).toEqual(
      expect.objectContaining({ status: 'active', winnerUserId: null }),
    )
  })

  it('отклоняет запись очков в завершённую игру', async () => {
    const { gameId, anya, boris } = await tableOfTwo(ctx.app, 50)
    await addEntry(ctx.app, gameId, boris, 50)

    const res = await addEntry(ctx.app, gameId, anya, 10)

    expect(res.statusCode).toBe(409)
  })

  it('возвращает игру в активное состояние, если победная запись отменена', async () => {
    const { gameId, boris } = await tableOfTwo(ctx.app, 50)
    const entryId = randomUUID()
    await addEntry(ctx.app, gameId, boris, 50, entryId)

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/entries/${entryId}/void`,
      headers: bearer(boris),
    })

    expect(res.json().game).toEqual(
      expect.objectContaining({ status: 'active', winnerUserId: null, finishedAt: null }),
    )
  })

  it('позволяет стартовать новую игру тем же составом после победы', async () => {
    const { roomCode, gameId, anya, boris } = await tableOfTwo(ctx.app, 50)
    await addEntry(ctx.app, gameId, boris, 50)

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${roomCode}/games`,
      headers: bearer(anya),
      payload: { scoreLimit: 50 },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().game.id).not.toBe(gameId)
    expect(res.json().game.players.map((p: { id: string }) => p.id).sort()).toEqual(
      [anya.user.id, boris.user.id].sort(),
    )
  })
})

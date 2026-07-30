import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { RoomState } from '@score/shared'
import { makeApp, closeApp, createGuestSession, bearer, type TestApp, type Guest } from './helpers.js'

let ctx: TestApp

beforeEach(async () => {
  ctx = await makeApp()
})

afterEach(async () => {
  await closeApp(ctx)
})

type Table = { anya: Guest; boris: Guest; code: string; gameId: string }

async function table(scoreLimit = 100): Promise<Table> {
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
  const started = await ctx.app.inject({
    method: 'POST',
    url: `/api/rooms/${code}/games`,
    headers: bearer(anya),
    payload: { scoreLimit },
  })

  return { anya, boris, code, gameId: started.json().game.id }
}

async function addPoints(t: Table, who: Guest, forUser: string, points: number): Promise<string> {
  const id = randomUUID()
  const res = await ctx.app.inject({
    method: 'POST',
    url: `/api/games/${t.gameId}/entries`,
    headers: bearer(who),
    payload: { id, userId: forUser, points },
  })
  if (res.statusCode !== 200) throw new Error(`запись не добавилась: ${res.body}`)
  return id
}

async function replace(who: Guest, entryId: string, payload: { id: string; points: number }) {
  return await ctx.app.inject({
    method: 'POST',
    url: `/api/entries/${entryId}/replace`,
    headers: bearer(who),
    payload,
  })
}

describe('правка записи', () => {
  it('меняет очки и пересчитывает счёт', async () => {
    const t = await table()
    const entryId = await addPoints(t, t.anya, t.anya.user.id, 15)

    const res = await replace(t.anya, entryId, { id: randomUUID(), points: 25 })
    const state = res.json() as RoomState

    expect(res.statusCode).toBe(200)
    expect(state.game!.scores[t.anya.user.id]).toBe(25)
  })

  // Журнал не переписывается: старая запись остаётся видна отменённой,
  // иначе за столом не разобраться, кто что исправил.
  it('оставляет прежнюю запись в журнале отменённой', async () => {
    const t = await table()
    const entryId = await addPoints(t, t.anya, t.anya.user.id, 15)

    const state = (await replace(t.anya, entryId, { id: randomUUID(), points: 25 })).json() as RoomState
    const old = state.game!.entries.find((entry) => entry.id === entryId)!

    expect(old.voidedAt).not.toBeNull()
    expect(old.voidedBy).toBe(t.anya.user.id)
    expect(state.game!.entries).toHaveLength(2)
  })

  it('приписывает новую запись тому же игроку, а не правящему', async () => {
    const t = await table()
    const entryId = await addPoints(t, t.boris, t.boris.user.id, 10)

    // Аня хост, поэтому может править чужое.
    const state = (await replace(t.anya, entryId, { id: randomUUID(), points: 30 })).json() as RoomState

    expect(state.game!.scores[t.boris.user.id]).toBe(30)
    expect(state.game!.scores[t.anya.user.id]).toBe(0)
  })

  // Ради этого маршрут и появился: через отмену и дописывание двумя запросами
  // игра успевала вернуться в active, и экран победы мигал у всех за столом.
  it('не роняет победу в промежуточное состояние', async () => {
    const t = await table(20)
    const entryId = await addPoints(t, t.anya, t.anya.user.id, 25)

    const state = (await replace(t.anya, entryId, { id: randomUUID(), points: 30 })).json() as RoomState

    expect(state.game!.status).toBe('finished')
    expect(state.game!.winnerUserId).toBe(t.anya.user.id)
  })

  it('снимает победу, если правка опустила счёт ниже лимита', async () => {
    const t = await table(20)
    const entryId = await addPoints(t, t.anya, t.anya.user.id, 25)

    const state = (await replace(t.anya, entryId, { id: randomUUID(), points: 5 })).json() as RoomState

    expect(state.game!.status).toBe('active')
    expect(state.game!.winnerUserId).toBeNull()
  })

  it('не даёт править чужую запись не хосту', async () => {
    const t = await table()
    const entryId = await addPoints(t, t.anya, t.anya.user.id, 15)

    const res = await replace(t.boris, entryId, { id: randomUUID(), points: 1 })

    expect(res.statusCode).toBe(403)
  })

  it('отвечает 404 на несуществующую запись', async () => {
    const t = await table()

    const res = await replace(t.anya, 'нет-такой', { id: randomUUID(), points: 5 })

    expect(res.statusCode).toBe(404)
  })

  it('не правит уже отменённую запись', async () => {
    const t = await table()
    const entryId = await addPoints(t, t.anya, t.anya.user.id, 15)
    await ctx.app.inject({
      method: 'POST',
      url: `/api/entries/${entryId}/void`,
      headers: bearer(t.anya),
    })

    const res = await replace(t.anya, entryId, { id: randomUUID(), points: 25 })

    expect(res.statusCode).toBe(409)
  })

  it('принимает только положительные очки', async () => {
    const t = await table()
    const entryId = await addPoints(t, t.anya, t.anya.user.id, 15)

    expect((await replace(t.anya, entryId, { id: randomUUID(), points: 0 })).statusCode).toBe(400)
    expect((await replace(t.anya, entryId, { id: randomUUID(), points: -5 })).statusCode).toBe(400)
  })

  // Повтор того же запроса при обрыве связи не должен править дважды.
  it('идемпотентен по идентификатору новой записи', async () => {
    const t = await table()
    const entryId = await addPoints(t, t.anya, t.anya.user.id, 15)
    const newId = randomUUID()

    await replace(t.anya, entryId, { id: newId, points: 25 })
    const second = await replace(t.anya, entryId, { id: newId, points: 25 })
    const state = second.json() as RoomState

    expect(state.game!.scores[t.anya.user.id]).toBe(25)
    expect(state.game!.entries).toHaveLength(2)
  })
})

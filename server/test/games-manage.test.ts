import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { makeApp, closeApp, createGuestSession, bearer, type TestApp, type Guest } from './helpers.js'

let ctx: TestApp

beforeEach(async () => {
  ctx = await makeApp()
})

afterEach(async () => {
  await closeApp(ctx)
})

async function roomWithPlayers(
  app: FastifyInstance,
  names: string[],
): Promise<{ roomCode: string; players: Guest[] }> {
  const players = []
  for (const name of names) players.push(await createGuestSession(app, name))
  const created = await app.inject({
    method: 'POST',
    url: '/api/rooms',
    headers: bearer(players[0]),
    payload: { name: 'Стол' },
  })
  const roomCode = created.json().room.code
  for (const player of players.slice(1)) {
    await app.inject({
      method: 'POST',
      url: `/api/rooms/${roomCode}/join`,
      headers: bearer(player),
      payload: {},
    })
  }
  return { roomCode, players }
}

async function startGame(
  app: FastifyInstance,
  roomCode: string,
  host: Guest,
  scoreLimit = 100,
): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: `/api/rooms/${roomCode}/games`,
    headers: bearer(host),
    payload: { scoreLimit },
  })
  return res.json().game.id
}

describe('POST /api/games/:id/limit', () => {
  it('хост меняет лимит на ходу', async () => {
    const { roomCode, players } = await roomWithPlayers(ctx.app, ['Аня', 'Борис'])
    const [anya] = players
    const gameId = await startGame(ctx.app, roomCode, anya)

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/games/${gameId}/limit`,
      headers: bearer(anya),
      payload: { scoreLimit: 300 },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().game.scoreLimit).toBe(300)
    expect(res.json().game.status).toBe('active')
  })

  it('снижение лимита ниже уже набранного сразу объявляет победителя', async () => {
    const { roomCode, players } = await roomWithPlayers(ctx.app, ['Аня', 'Борис'])
    const [anya, boris] = players
    const gameId = await startGame(ctx.app, roomCode, anya, 100)
    await ctx.app.inject({
      method: 'POST',
      url: `/api/games/${gameId}/entries`,
      headers: bearer(anya),
      payload: { id: 'e1', userId: boris.user.id, points: 50 },
    })

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/games/${gameId}/limit`,
      headers: bearer(anya),
      payload: { scoreLimit: 40 },
    })

    expect(res.json().game.status).toBe('finished')
    expect(res.json().game.winnerUserId).toBe(boris.user.id)
  })

  it('не пускает не-хоста', async () => {
    const { roomCode, players } = await roomWithPlayers(ctx.app, ['Аня', 'Борис'])
    const [anya, boris] = players
    const gameId = await startGame(ctx.app, roomCode, anya)

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/games/${gameId}/limit`,
      headers: bearer(boris),
      payload: { scoreLimit: 300 },
    })

    expect(res.statusCode).toBe(403)
  })

  it('запрещает менять лимит уже закончившейся игры', async () => {
    const { roomCode, players } = await roomWithPlayers(ctx.app, ['Аня', 'Борис'])
    const [anya] = players
    const gameId = await startGame(ctx.app, roomCode, anya)
    ctx.db.prepare(`UPDATE games SET status = 'finished' WHERE id = ?`).run(gameId)

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/games/${gameId}/limit`,
      headers: bearer(anya),
      payload: { scoreLimit: 300 },
    })

    expect(res.statusCode).toBe(409)
  })

  it('отклоняет лимит вне диапазона', async () => {
    const { roomCode, players } = await roomWithPlayers(ctx.app, ['Аня', 'Борис'])
    const [anya] = players
    const gameId = await startGame(ctx.app, roomCode, anya)

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/games/${gameId}/limit`,
      headers: bearer(anya),
      payload: { scoreLimit: 0 },
    })

    expect(res.statusCode).toBe(400)
  })
})

describe('POST /api/games/:id/players/:userId/remove', () => {
  it('хост убирает игрока из партии, не заканчивая её', async () => {
    const { roomCode, players } = await roomWithPlayers(ctx.app, ['Аня', 'Борис', 'Вера'])
    const [anya, boris, vera] = players
    const gameId = await startGame(ctx.app, roomCode, anya)

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/games/${gameId}/players/${vera.user.id}/remove`,
      headers: bearer(anya),
    })

    expect(res.statusCode).toBe(200)
    const state = res.json()
    expect(state.game.status).toBe('active')
    expect(state.game.players.map((p: { id: string }) => p.id).sort()).toEqual(
      [anya.user.id, boris.user.id].sort(),
    )
  })

  it('очки убранного игрока остаются в истории партии', async () => {
    const { roomCode, players } = await roomWithPlayers(ctx.app, ['Аня', 'Борис', 'Вера'])
    const [anya, boris, vera] = players
    const gameId = await startGame(ctx.app, roomCode, anya)
    await ctx.app.inject({
      method: 'POST',
      url: `/api/games/${gameId}/entries`,
      headers: bearer(anya),
      payload: { id: 'e1', userId: vera.user.id, points: 30 },
    })

    await ctx.app.inject({
      method: 'POST',
      url: `/api/games/${gameId}/players/${vera.user.id}/remove`,
      headers: bearer(anya),
    })

    const history = await ctx.app.inject({
      method: 'GET',
      url: `/api/games/${gameId}`,
      headers: bearer(boris),
    })
    expect(history.json().players.map((p: { id: string }) => p.id).sort()).toEqual(
      [anya.user.id, boris.user.id, vera.user.id].sort(),
    )
    expect(history.json().scores[vera.user.id]).toBe(30)
  })

  it('не даёт снизить состав меньше двух', async () => {
    const { roomCode, players } = await roomWithPlayers(ctx.app, ['Аня', 'Борис'])
    const [anya, boris] = players
    const gameId = await startGame(ctx.app, roomCode, anya)

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/games/${gameId}/players/${boris.user.id}/remove`,
      headers: bearer(anya),
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().error).toBe('bad_player_count')
  })

  it('не пускает не-хоста', async () => {
    const { roomCode, players } = await roomWithPlayers(ctx.app, ['Аня', 'Борис', 'Вера'])
    const [anya, boris, vera] = players
    const gameId = await startGame(ctx.app, roomCode, anya)

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/games/${gameId}/players/${vera.user.id}/remove`,
      headers: bearer(boris),
    })

    expect(res.statusCode).toBe(403)
  })

  it('404 на того, кого в этой партии нет', async () => {
    const { roomCode, players } = await roomWithPlayers(ctx.app, ['Аня', 'Борис'])
    const [anya] = players
    const gameId = await startGame(ctx.app, roomCode, anya)
    const chuzhoj = await createGuestSession(ctx.app, 'Посторонний')

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/games/${gameId}/players/${chuzhoj.user.id}/remove`,
      headers: bearer(anya),
    })

    expect(res.statusCode).toBe(404)
    expect(res.json().error).toBe('not_a_player')
  })
})

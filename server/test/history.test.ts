import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { GameHistoryItem, MyStats } from '@score/shared'
import { makeApp, closeApp, createGuestSession, bearer, type TestApp, type Guest } from './helpers.js'

let ctx: TestApp

beforeEach(async () => {
  ctx = await makeApp()
})

afterEach(async () => {
  await closeApp(ctx)
})

async function room(host: Guest, name: string): Promise<string> {
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/api/rooms',
    headers: bearer(host),
    payload: { name },
  })
  return res.json().room.code as string
}

async function join(guest: Guest, code: string): Promise<void> {
  await ctx.app.inject({
    method: 'POST',
    url: `/api/rooms/${code}/join`,
    headers: bearer(guest),
    payload: {},
  })
}

async function start(host: Guest, code: string, scoreLimit: number): Promise<string> {
  const res = await ctx.app.inject({
    method: 'POST',
    url: `/api/rooms/${code}/games`,
    headers: bearer(host),
    payload: { scoreLimit },
  })
  if (res.statusCode !== 200) throw new Error(`игра не началась: ${res.body}`)
  return res.json().game.id as string
}

async function add(who: Guest, gameId: string, userId: string, points: number): Promise<void> {
  const res = await ctx.app.inject({
    method: 'POST',
    url: `/api/games/${gameId}/entries`,
    headers: bearer(who),
    payload: { id: randomUUID(), userId, points },
  })
  if (res.statusCode !== 200) throw new Error(`очки не записались: ${res.body}`)
}

function myGames(who: Guest, query = '') {
  return ctx.app.inject({ method: 'GET', url: `/api/me/games${query}`, headers: bearer(who) })
}

function myStats(who: Guest) {
  return ctx.app.inject({ method: 'GET', url: '/api/me/stats', headers: bearer(who) })
}

/** Доигранная партия: Аня набирает лимит и побеждает. */
async function playedGame(anya: Guest, boris: Guest, name: string, limit = 20): Promise<string> {
  const code = await room(anya, name)
  await join(boris, code)
  const gameId = await start(anya, code, limit)
  await add(boris, gameId, boris.user.id, 5)
  await add(anya, gameId, anya.user.id, limit + 1)
  return gameId
}

describe('мои игры', () => {
  it('отдаёт сыгранные партии с именами соперников', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')
    const boris = await createGuestSession(ctx.app, 'Борис')
    await playedGame(anya, boris, 'Преферанс')

    const games = (await myGames(anya)).json() as GameHistoryItem[]

    expect(games).toHaveLength(1)
    expect(games[0].roomName).toBe('Преферанс')
    expect(games[0].players.map((p) => p.nickname).sort()).toEqual(['Аня', 'Борис'])
    expect(games[0].myScore).toBe(21)
    expect(games[0].winnerUserId).toBe(anya.user.id)
  })

  it('не показывает чужие игры', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')
    const boris = await createGuestSession(ctx.app, 'Борис')
    const vera = await createGuestSession(ctx.app, 'Вера')
    await playedGame(anya, boris, 'Преферанс')

    expect((await myGames(vera)).json()).toEqual([])
  })

  it('отдаёт свежие партии первыми', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')
    const boris = await createGuestSession(ctx.app, 'Борис')
    await playedGame(anya, boris, 'Первая')
    await playedGame(anya, boris, 'Вторая')

    const games = (await myGames(anya)).json() as GameHistoryItem[]

    expect(games.map((game) => game.roomName)).toEqual(['Вторая', 'Первая'])
  })

  it('ограничивает список по просьбе', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')
    const boris = await createGuestSession(ctx.app, 'Борис')
    await playedGame(anya, boris, 'Первая')
    await playedGame(anya, boris, 'Вторая')

    expect(((await myGames(anya, '?limit=1')).json() as GameHistoryItem[])).toHaveLength(1)
  })

  it('требует представиться', async () => {
    expect((await ctx.app.inject({ method: 'GET', url: '/api/me/games' })).statusCode).toBe(401)
  })
})

describe('доступ к прошлой игре', () => {
  // Ушедший из комнаты не должен терять доступ к собственной истории.
  it('пускает участника состава, даже если он вышел из комнаты', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')
    const boris = await createGuestSession(ctx.app, 'Борис')
    const code = await room(anya, 'Преферанс')
    await join(boris, code)
    const gameId = await start(anya, code, 100)
    await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${code}/leave`,
      headers: bearer(boris),
    })

    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/games/${gameId}`,
      headers: bearer(boris),
    })

    expect(res.statusCode).toBe(200)
  })

  // Тот же принцип, что и у экранов: по ответу должно быть что нарисовать.
  it('отдаёт имена и раздачи, а не одни идентификаторы', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')
    const boris = await createGuestSession(ctx.app, 'Борис')
    const gameId = await playedGame(anya, boris, 'Преферанс')

    const details = (
      await ctx.app.inject({
        method: 'GET',
        url: `/api/games/${gameId}`,
        headers: bearer(anya),
      })
    ).json()

    expect(details.roomName).toBe('Преферанс')
    expect(details.players.map((p: { nickname: string }) => p.nickname).sort()).toEqual([
      'Аня',
      'Борис',
    ])
    expect(details.entries).toHaveLength(2)
    expect(details.scores[anya.user.id]).toBe(21)
  })

  it('не пускает постороннего', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')
    const boris = await createGuestSession(ctx.app, 'Борис')
    const vera = await createGuestSession(ctx.app, 'Вера')
    const gameId = await playedGame(anya, boris, 'Преферанс')

    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/games/${gameId}`,
      headers: bearer(vera),
    })

    expect(res.statusCode).toBe(403)
  })
})

describe('моя сводка', () => {
  it('считает партии и победы', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')
    const boris = await createGuestSession(ctx.app, 'Борис')
    await playedGame(anya, boris, 'Первая')
    await playedGame(anya, boris, 'Вторая')

    const stats = (await myStats(anya)).json() as MyStats

    expect(stats.gamesPlayed).toBe(2)
    expect(stats.wins).toBe(2)
    expect((await myStats(boris)).json().wins).toBe(0)
  })

  it('запоминает лучший результат', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')
    const boris = await createGuestSession(ctx.app, 'Борис')
    await playedGame(anya, boris, 'Первая', 20)
    await playedGame(anya, boris, 'Вторая', 50)

    expect(((await myStats(anya)).json() as MyStats).bestScore).toBe(51)
  })

  it('перечисляет соперников по частоте', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')
    const boris = await createGuestSession(ctx.app, 'Борис')
    const vera = await createGuestSession(ctx.app, 'Вера')

    await playedGame(anya, boris, 'Первая')
    await playedGame(anya, boris, 'Вторая')
    const code = await room(anya, 'Третья')
    await join(vera, code)
    const gameId = await start(anya, code, 20)
    await add(anya, gameId, anya.user.id, 21)

    const stats = (await myStats(anya)).json() as MyStats

    expect(stats.opponents.map((o) => o.user.nickname)).toEqual(['Борис', 'Вера'])
    expect(stats.opponents[0].games).toBe(2)
    expect(stats.opponents.map((o) => o.user.id)).not.toContain(anya.user.id)
  })

  // Недоигранная партия ничего не говорит ни о победах, ни о поражениях.
  it('не учитывает незавершённые партии', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')
    const boris = await createGuestSession(ctx.app, 'Борис')
    const code = await room(anya, 'Идущая')
    await join(boris, code)
    const gameId = await start(anya, code, 100)
    await add(anya, gameId, anya.user.id, 10)

    const stats = (await myStats(anya)).json() as MyStats

    expect(stats.gamesPlayed).toBe(0)
    expect(stats.opponents).toEqual([])
  })

  it('у новичка сводка пустая, а не сломанная', async () => {
    const novice = await createGuestSession(ctx.app, 'Новичок')

    const stats = (await myStats(novice)).json() as MyStats

    expect(stats).toEqual({ gamesPlayed: 0, wins: 0, bestScore: 0, opponents: [] })
  })
})

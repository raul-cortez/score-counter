import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { RoomState } from '@score/shared'
import { makeApp, closeApp, createGuestSession, bearer, type TestApp } from './helpers.js'

let ctx: TestApp

beforeEach(async () => {
  ctx = await makeApp()
})

afterEach(async () => {
  await closeApp(ctx)
})

/** Как клиент отрисовал бы экран ожидания: состав и кнопка «Старт» только у хоста. */
function renderRoomScreen(state: RoomState, viewerId: string): string {
  const lines = [`Комната «${state.room.name}», код ${state.room.code}`]
  for (const member of state.members) {
    const marks = [
      member.id === state.room.hostUserId ? 'хост' : null,
      member.id === viewerId ? 'вы' : null,
    ].filter(Boolean)
    lines.push(`  ${member.nickname}${marks.length ? ` (${marks.join(', ')})` : ''}`)
  }
  if (state.room.hostUserId === viewerId && state.game === null) {
    lines.push('  [Старт]')
  }
  return lines.join('\n')
}

/** Как клиент отрисовал бы табло. */
function renderScoreboard(state: RoomState): string {
  const game = state.game!
  const lines = [`До ${game.scoreLimit} очков`]
  for (const player of game.players) {
    lines.push(`  ${player.nickname}: ${game.scores[player.id]}`)
  }
  if (game.winnerUserId !== null) {
    const winner = game.players.find((p) => p.id === game.winnerUserId)!
    lines.push(`  Победил ${winner.nickname}`)
  }
  return lines.join('\n')
}

async function roomOfTwo() {
  const anya = await createGuestSession(ctx.app, 'Аня')
  const boris = await createGuestSession(ctx.app, 'Борис')
  const created = await ctx.app.inject({
    method: 'POST',
    url: '/api/rooms',
    headers: bearer(anya),
    payload: { name: 'Преферанс' },
  })
  const code = created.json().room.code
  const joined = await ctx.app.inject({
    method: 'POST',
    url: `/api/rooms/${code}/join`,
    headers: bearer(boris),
    payload: {},
  })
  return { anya, boris, code, state: joined.json() as RoomState }
}

describe('экраны собираются только из ответов API', () => {
  it('экран ожидания показывает имена, хоста и кнопку старта', async () => {
    const { anya, boris, state } = await roomOfTwo()

    const forHost = renderRoomScreen(state, anya.user.id)
    const forGuest = renderRoomScreen(state, boris.user.id)

    expect(forHost).toContain('Аня (хост, вы)')
    expect(forHost).toContain('Борис')
    expect(forHost).toContain('[Старт]')
    expect(forGuest).toContain('Борис (вы)')
    expect(forGuest).not.toContain('[Старт]')
  })

  it('табло показывает имена и счёт, а не идентификаторы', async () => {
    const { anya, boris, code } = await roomOfTwo()
    const started = await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${code}/games`,
      headers: bearer(anya),
      payload: { scoreLimit: 30 },
    })
    const afterEntry = await ctx.app.inject({
      method: 'POST',
      url: `/api/games/${started.json().game.id}/entries`,
      headers: bearer(boris),
      payload: { id: randomUUID(), userId: boris.user.id, points: 30 },
    })

    const board = renderScoreboard(afterEntry.json())

    expect(board).toContain('До 30 очков')
    expect(board).toContain('Аня: 0')
    expect(board).toContain('Борис: 30')
    expect(board).toContain('Победил Борис')
    expect(board).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/)
  })

  it('после перезагрузки страницы экран восстанавливается по одному токену', async () => {
    const { anya, boris, code } = await roomOfTwo()
    await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${code}/games`,
      headers: bearer(anya),
      payload: { scoreLimit: 30 },
    })

    // Всё, что осталось у браузера, — токен.
    const me = await ctx.app.inject({ method: 'GET', url: '/api/me', headers: bearer(boris) })
    const restored = await ctx.app.inject({
      method: 'GET',
      url: `/api/rooms/${me.json().activeRoomCode}/state`,
      headers: bearer(boris),
    })

    expect(renderScoreboard(restored.json())).toContain('Борис: 0')
    expect(renderRoomScreen(restored.json(), boris.user.id)).toContain('Аня (хост)')
  })

  it('ссылка-приглашение показывает комнату до входа одним запросом', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')
    const boris = await createGuestSession(ctx.app, 'Борис')
    const created = await ctx.app.inject({
      method: 'POST',
      url: '/api/rooms',
      headers: bearer(anya),
      payload: { name: 'Преферанс', password: 'секрет' },
    })

    const preview = await ctx.app.inject({
      method: 'GET',
      url: `/api/rooms/${created.json().room.code}`,
      headers: bearer(boris),
    })

    expect(preview.json().name).toBe('Преферанс')
    expect(preview.json().hasPassword).toBe(true)
  })

  it('экран победы переживает перезагрузку', async () => {
    const { anya, boris, code } = await roomOfTwo()
    const started = await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${code}/games`,
      headers: bearer(anya),
      payload: { scoreLimit: 30 },
    })
    await ctx.app.inject({
      method: 'POST',
      url: `/api/games/${started.json().game.id}/entries`,
      headers: bearer(boris),
      payload: { id: randomUUID(), userId: boris.user.id, points: 30 },
    })

    const restored = await ctx.app.inject({
      method: 'GET',
      url: `/api/rooms/${code}/state`,
      headers: bearer(anya),
    })

    expect(renderScoreboard(restored.json())).toContain('Победил Борис')
  })
})

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import { makeApp, closeApp, type TestApp } from './helpers.js'
import { createGuest } from '../src/repo/users.js'
import { createRoom, addMember } from '../src/repo/rooms.js'
import { startGame } from '../src/repo/games.js'
import { insertEntry } from '../src/repo/entries.js'
import { buildRoomState } from '../src/state/roomState.js'

let ctx: TestApp

beforeEach(async () => {
  ctx = await makeApp()
})

afterEach(async () => {
  await closeApp(ctx)
})

function tableOfTwo() {
  const anya = createGuest(ctx.db, 'Аня')
  const boris = createGuest(ctx.db, 'Борис')
  const room = createRoom(ctx.db, 'Преферанс', null, anya.id)
  addMember(ctx.db, room.id, anya.id)
  addMember(ctx.db, room.id, boris.id)
  return { anya, boris, room }
}

describe('buildRoomState', () => {
  it('возвращает null для несуществующей комнаты', () => {
    expect(buildRoomState(ctx.db, 'нет-такой')).toBeNull()
  })

  it('отдаёт комнату с хостом и участниками по именам', () => {
    const { anya, boris, room } = tableOfTwo()

    const state = buildRoomState(ctx.db, room.id)!

    expect(state.room).toEqual({
      id: room.id,
      code: room.code,
      name: 'Преферанс',
      hasPassword: false,
      hostUserId: anya.id,
    })
    expect(state.members.map((m) => m.nickname).sort()).toEqual(['Аня', 'Борис'])
    expect(state.members.map((m) => m.id).sort()).toEqual([anya.id, boris.id].sort())
    expect(state.game).toBeNull()
  })

  it('не выдаёт хэш пароля наружу', () => {
    const anya = createGuest(ctx.db, 'Аня')
    const room = createRoom(ctx.db, 'Закрытая', '$argon2id$секрет', anya.id)
    addMember(ctx.db, room.id, anya.id)

    const state = buildRoomState(ctx.db, room.id)!

    expect(state.room.hasPassword).toBe(true)
    expect(JSON.stringify(state)).not.toContain('argon2')
  })

  it('не выдаёт ушедших участников', () => {
    const { boris, room } = tableOfTwo()
    ctx.db
      .prepare('UPDATE room_members SET left_at = ? WHERE room_id = ? AND user_id = ?')
      .run(Date.now(), room.id, boris.id)

    const state = buildRoomState(ctx.db, room.id)!

    expect(state.members.map((m) => m.nickname)).toEqual(['Аня'])
  })

  it('отдаёт игру с игроками, счётом и журналом', () => {
    const { anya, boris, room } = tableOfTwo()
    const game = startGame(ctx.db, room.id, 100, [anya.id, boris.id])
    insertEntry(ctx.db, {
      id: randomUUID(),
      gameId: game.id,
      userId: boris.id,
      points: 12,
      createdBy: boris.id,
    })

    const state = buildRoomState(ctx.db, room.id)!

    expect(state.game!.id).toBe(game.id)
    expect(state.game!.scoreLimit).toBe(100)
    expect(state.game!.players.map((p) => p.nickname)).toEqual(['Аня', 'Борис'])
    expect(state.game!.scores).toEqual({ [anya.id]: 0, [boris.id]: 12 })
    expect(state.game!.entries).toHaveLength(1)
  })

  it('оставляет ушедшего из комнаты в составе игры', () => {
    const { anya, boris, room } = tableOfTwo()
    startGame(ctx.db, room.id, 100, [anya.id, boris.id])
    ctx.db
      .prepare('UPDATE room_members SET left_at = ? WHERE room_id = ? AND user_id = ?')
      .run(Date.now(), room.id, boris.id)

    const state = buildRoomState(ctx.db, room.id)!

    expect(state.members.map((m) => m.nickname)).toEqual(['Аня'])
    expect(state.game!.players.map((p) => p.nickname)).toEqual(['Аня', 'Борис'])
  })

  it('показывает последнюю игру, а не первую', () => {
    const { anya, boris, room } = tableOfTwo()
    const first = startGame(ctx.db, room.id, 100, [anya.id, boris.id])
    ctx.db
      .prepare(`UPDATE games SET status = 'finished', started_at = 1000 WHERE id = ?`)
      .run(first.id)
    const second = startGame(ctx.db, room.id, 50, [anya.id, boris.id])
    ctx.db.prepare('UPDATE games SET started_at = 2000 WHERE id = ?').run(second.id)

    const state = buildRoomState(ctx.db, room.id)!

    expect(state.game!.id).toBe(second.id)
  })

  it('сохраняет завершённую игру в состоянии, чтобы пережить перезагрузку', () => {
    const { anya, boris, room } = tableOfTwo()
    const game = startGame(ctx.db, room.id, 100, [anya.id, boris.id])
    ctx.db
      .prepare(`UPDATE games SET status = 'finished', winner_user_id = ? WHERE id = ?`)
      .run(boris.id, game.id)

    const state = buildRoomState(ctx.db, room.id)!

    expect(state.game!.status).toBe('finished')
    expect(state.game!.winnerUserId).toBe(boris.id)
  })
})

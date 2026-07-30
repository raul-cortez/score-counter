import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { openDb, type Db } from '../src/db/index.js'
import { createGuest } from '../src/repo/users.js'
import { createRoom } from '../src/repo/rooms.js'
import { startGame, findGameById, finishGame, sweepAbandoned } from '../src/repo/games.js'
import { insertEntry } from '../src/repo/entries.js'
import { ABANDON_AFTER_MS } from '../src/domain/abandoned.js'

let db: Db
let roomId: string
let players: string[]

const DAY = ABANDON_AFTER_MS

beforeEach(() => {
  db = openDb(':memory:')
  const anna = createGuest(db, 'Анна')
  const boris = createGuest(db, 'Борис')
  players = [anna.id, boris.id]
  roomId = createRoom(db, 'Комната', null, anna.id).id
})

afterEach(() => db.close())

/** Игра, у которой начало и записи сдвинуты в прошлое на заданный возраст. */
function gameAgedBy(ageMs: number, withEntry: boolean): string {
  const game = startGame(db, roomId, 100, players)
  const when = Date.now() - ageMs

  db.prepare('UPDATE games SET started_at = ? WHERE id = ?').run(when, game.id)
  if (withEntry) {
    insertEntry(db, {
      id: `entry-${game.id}`,
      gameId: game.id,
      userId: players[0],
      points: 10,
      createdBy: players[0],
    })
    db.prepare('UPDATE score_entries SET created_at = ? WHERE game_id = ?').run(when, game.id)
  }
  return game.id
}

describe('пометка брошенных игр', () => {
  it('гасит активную игру, в которой сутки ничего не происходило', () => {
    const gameId = gameAgedBy(DAY + 1000, true)

    sweepAbandoned(db, Date.now())

    expect(findGameById(db, gameId)!.status).toBe('abandoned')
  })

  it('не трогает игру, в которой активность была недавно', () => {
    const gameId = gameAgedBy(DAY - 60_000, true)

    sweepAbandoned(db, Date.now())

    expect(findGameById(db, gameId)!.status).toBe('active')
  })

  // Свежая запись очков в старой игре означает, что за столом ещё сидят.
  it('считает возраст по последней записи, а не по началу игры', () => {
    const game = startGame(db, roomId, 100, players)
    db.prepare('UPDATE games SET started_at = ? WHERE id = ?').run(
      Date.now() - DAY * 3,
      game.id,
    )
    insertEntry(db, {
      id: 'fresh',
      gameId: game.id,
      userId: players[0],
      points: 10,
      createdBy: players[0],
    })

    sweepAbandoned(db, Date.now())

    expect(findGameById(db, game.id)!.status).toBe('active')
  })

  it('гасит старую игру, в которой вообще не было записей', () => {
    const gameId = gameAgedBy(DAY + 1000, false)

    sweepAbandoned(db, Date.now())

    expect(findGameById(db, gameId)!.status).toBe('abandoned')
  })

  // Доигранная партия остаётся победой навсегда, сколько бы времени ни прошло.
  it('не переписывает завершённые игры', () => {
    const gameId = gameAgedBy(DAY * 10, true)
    finishGame(db, gameId, players[0])

    sweepAbandoned(db, Date.now())

    expect(findGameById(db, gameId)!.status).toBe('finished')
  })
})

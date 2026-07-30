import { describe, it, expect } from 'vitest'
import type { ScoreEntry } from '@score/shared'
import { totalForPlayer, scoreboard } from '../../src/domain/score.js'

function entry(over: Partial<ScoreEntry> & { seq: number; userId: string; points: number }): ScoreEntry {
  return {
    id: `e${over.seq}`,
    gameId: 'g1',
    createdBy: over.userId,
    createdAt: over.seq * 1000,
    voidedAt: null,
    voidedBy: null,
    ...over,
  }
}

describe('totalForPlayer', () => {
  it('складывает очки одного игрока и игнорирует чужие', () => {
    const entries = [
      entry({ seq: 1, userId: 'anya', points: 10 }),
      entry({ seq: 2, userId: 'boris', points: 30 }),
      entry({ seq: 3, userId: 'anya', points: 5 }),
    ]

    expect(totalForPlayer(entries, 'anya')).toBe(15)
  })

  it('не учитывает отменённые записи', () => {
    const entries = [
      entry({ seq: 1, userId: 'anya', points: 10 }),
      entry({ seq: 2, userId: 'anya', points: 40, voidedAt: 9999, voidedBy: 'anya' }),
    ]

    expect(totalForPlayer(entries, 'anya')).toBe(10)
  })

  it('складывает отрицательные очки', () => {
    const entries = [
      entry({ seq: 1, userId: 'anya', points: 10 }),
      entry({ seq: 2, userId: 'anya', points: -4 }),
    ]

    expect(totalForPlayer(entries, 'anya')).toBe(6)
  })

  it('даёт ноль игроку без записей', () => {
    expect(totalForPlayer([], 'anya')).toBe(0)
  })
})

describe('scoreboard', () => {
  it('возвращает по строке на каждого игрока состава, включая пустых', () => {
    const entries = [
      entry({ seq: 1, userId: 'anya', points: 10 }),
      entry({ seq: 2, userId: 'boris', points: 30 }),
    ]

    expect(scoreboard(entries, ['anya', 'boris', 'vera'])).toEqual({
      anya: 10,
      boris: 30,
      vera: 0,
    })
  })

  it('игнорирует записи игроков вне состава', () => {
    const entries = [
      entry({ seq: 1, userId: 'anya', points: 10 }),
      entry({ seq: 2, userId: 'chuzhoj', points: 999 }),
    ]

    expect(scoreboard(entries, ['anya'])).toEqual({ anya: 10 })
  })
})

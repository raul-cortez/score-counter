import { describe, it, expect } from 'vitest'
import type { ScoreEntry } from '@score/shared'
import { findWinner } from '../../src/domain/victory.js'

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

const players = ['anya', 'boris']

describe('findWinner', () => {
  it('возвращает null, пока лимит не достигнут', () => {
    const entries = [entry({ seq: 1, userId: 'anya', points: 40 })]

    expect(findWinner(entries, players, 100)).toBeNull()
  })

  it('находит игрока, набравшего ровно лимит', () => {
    const entries = [
      entry({ seq: 1, userId: 'anya', points: 60 }),
      entry({ seq: 2, userId: 'anya', points: 40 }),
    ]

    expect(findWinner(entries, players, 100)).toBe('anya')
  })

  it('находит игрока, перешагнувшего лимит', () => {
    const entries = [entry({ seq: 1, userId: 'boris', points: 150 })]

    expect(findWinner(entries, players, 100)).toBe('boris')
  })

  it('при почти одновременном переходе выигрывает меньший seq', () => {
    const entries = [
      entry({ seq: 1, userId: 'anya', points: 90 }),
      entry({ seq: 2, userId: 'boris', points: 90 }),
      entry({ seq: 3, userId: 'boris', points: 20 }),
      entry({ seq: 4, userId: 'anya', points: 20 }),
    ]

    expect(findWinner(entries, players, 100)).toBe('boris')
  })

  it('не считает победой отменённую запись', () => {
    const entries = [
      entry({ seq: 1, userId: 'anya', points: 90 }),
      entry({ seq: 2, userId: 'anya', points: 20, voidedAt: 5000, voidedBy: 'anya' }),
    ]

    expect(findWinner(entries, players, 100)).toBeNull()
  })

  it('после отмены победа переходит другому игроку', () => {
    const entries = [
      entry({ seq: 1, userId: 'anya', points: 100, voidedAt: 5000, voidedBy: 'anya' }),
      entry({ seq: 2, userId: 'boris', points: 100 }),
    ]

    expect(findWinner(entries, players, 100)).toBe('boris')
  })

  it('игнорирует записи игроков вне состава', () => {
    const entries = [entry({ seq: 1, userId: 'chuzhoj', points: 500 })]

    expect(findWinner(entries, players, 100)).toBeNull()
  })

  it('разбирает записи в порядке seq, а не в порядке массива', () => {
    const entries = [
      entry({ seq: 3, userId: 'anya', points: 20 }),
      entry({ seq: 1, userId: 'anya', points: 90 }),
      entry({ seq: 2, userId: 'boris', points: 110 }),
    ]

    expect(findWinner(entries, players, 100)).toBe('boris')
  })
})

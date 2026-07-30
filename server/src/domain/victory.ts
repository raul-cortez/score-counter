import type { ScoreEntry } from '@score/shared'

/**
 * Проигрывает журнал в порядке seq и возвращает первого игрока,
 * чей накопленный счёт достиг лимита. Отменённые записи пропускаются,
 * поэтому отмена задним числом корректно меняет исход.
 */
export function findWinner(
  entries: ScoreEntry[],
  playerIds: string[],
  scoreLimit: number,
): string | null {
  const totals: Record<string, number> = {}
  for (const id of playerIds) {
    totals[id] = 0
  }

  const ordered = entries
    .filter((entry) => entry.voidedAt === null)
    .sort((a, b) => a.seq - b.seq)

  for (const entry of ordered) {
    if (!(entry.userId in totals)) continue
    totals[entry.userId] += entry.points
    if (totals[entry.userId] >= scoreLimit) {
      return entry.userId
    }
  }

  return null
}

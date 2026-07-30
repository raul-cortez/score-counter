import type { ScoreEntry } from '@score/shared'

/** Учитываются только неотменённые записи — отмена не удаляет строку, а гасит её вклад. */
export function totalForPlayer(entries: ScoreEntry[], userId: string): number {
  let total = 0
  for (const entry of entries) {
    if (entry.userId === userId && entry.voidedAt === null) {
      total += entry.points
    }
  }
  return total
}

export function scoreboard(entries: ScoreEntry[], playerIds: string[]): Record<string, number> {
  const totals: Record<string, number> = {}
  for (const id of playerIds) {
    totals[id] = 0
  }
  for (const entry of entries) {
    if (entry.voidedAt !== null) continue
    if (!(entry.userId in totals)) continue
    totals[entry.userId] += entry.points
  }
  return totals
}

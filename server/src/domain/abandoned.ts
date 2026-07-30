/** Сутки без единой записи очков — игра считается брошенной. */
export const ABANDON_AFTER_MS = 24 * 60 * 60 * 1000

/**
 * Момент, старше которого активная игра признаётся брошенной.
 *
 * Правило вынесено сюда, а не зашито в SQL, чтобы порог был виден в одном месте
 * и проверялся без базы.
 */
export function abandonCutoff(now: number, after: number = ABANDON_AFTER_MS): number {
  return now - after
}

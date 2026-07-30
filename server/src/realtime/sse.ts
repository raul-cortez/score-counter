/**
 * Формат потока.
 *
 * X-Accel-Buffering отключает буферизацию на промежуточном прокси, иначе кадры
 * копятся и приходят пачкой. Heartbeat нужен по той же причине: простаивающее
 * соединение прокси разрывают, а комментарий трафиком не считается.
 */

export const SSE_HEADERS: Record<string, string> = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
}

export const HEARTBEAT_MS = 25_000
export const HEARTBEAT = ': ping\n\n'

export type Frame = {
  event: string
  data: unknown
  /**
   * Заполняется только у событий из журнала. Кадры sync и presence идут без него,
   * чтобы браузер не сдвинул Last-Event-ID на то, чего в журнале нет.
   */
  id?: number
}

export function formatFrame({ event, data, id }: Frame): string {
  const head = id === undefined ? '' : `id: ${id}\n`
  // JSON.stringify не выдаёт настоящих переводов строки, поэтому data занимает одну строку.
  return `${head}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

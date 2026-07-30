/**
 * Дата партии человеческими словами.
 *
 * «Сегодня» и «вчера» читаются быстрее числа: почти вся история — это последние
 * несколько вечеров.
 */
export function formatPlayedAt(timestamp: number, now: number = Date.now()): string {
  const when = new Date(timestamp)
  const time = when.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })

  const startOfDay = (date: Date): number =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()

  const days = Math.round((startOfDay(new Date(now)) - startOfDay(when)) / 86_400_000)

  if (days === 0) return `сегодня в ${time}`
  if (days === 1) return `вчера в ${time}`

  const date = when.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    ...(when.getFullYear() === new Date(now).getFullYear() ? {} : { year: 'numeric' }),
  })
  return `${date} в ${time}`
}

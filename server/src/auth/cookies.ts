const COOKIE_NAME = 'sid'

/** Верхняя граница, которую держат браузеры для Max-Age, — дальше её всё равно обрежут. */
const MAX_AGE_SECONDS = 60 * 60 * 24 * 400

/**
 * Резервный канал опознания рядом с заголовком Authorization.
 *
 * Safari чистит localStorage через 7 дней бездействия сайта (ITP), если его не
 * добавили на домашний экран, — человек возвращается через неделю и оказывается
 * незнакомцем в собственной комнате. HttpOnly-кука той чисткой не задета: токен
 * внутри тот же самый, второй секрет заводить незачем.
 */
export function sessionCookie(token: string): string {
  return `${COOKIE_NAME}=${token}; Path=/; Max-Age=${MAX_AGE_SECONDS}; HttpOnly; Secure; SameSite=Lax`
}

export function readSessionCookie(header: string | undefined): string | null {
  if (!header) return null
  for (const part of header.split(';')) {
    const separator = part.indexOf('=')
    if (separator === -1) continue
    if (part.slice(0, separator).trim() !== COOKIE_NAME) continue
    return part.slice(separator + 1).trim()
  }
  return null
}

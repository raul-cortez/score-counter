/**
 * Правила логина и пароля — те же, что сторожит сервер, и продублированы здесь
 * намеренно.
 *
 * Серверная проверка отказывает по-английски и словами Fastify («must match
 * pattern…»), а человеку за столом, с телефоном в одной руке, нужно русское слово
 * и сразу — не дожидаясь ответа сети. Так что проверяем до отправки, а серверная
 * остаётся страховкой: без неё правило обходится правкой запроса.
 *
 * Логин приводится к нижнему регистру здесь же, чтобы «Аня» и «аня» не оказались
 * потом разными людьми: сервер хранит и ищет его в нижнем.
 */
const LOGIN_PATTERN = /^[a-z0-9._-]{3,32}$/

const MIN_LOGIN_LENGTH = 3
const MAX_LOGIN_LENGTH = 32
const MIN_PASSWORD_LENGTH = 8

/** Возвращает причину отказа или `null`, если логин годится. */
export function loginProblem(raw: string): string | null {
  const login = normalizeLogin(raw)
  if (login === '') return 'нужен логин'
  if (login.length < MIN_LOGIN_LENGTH) return 'логин короче трёх символов'
  if (login.length > MAX_LOGIN_LENGTH) return 'логин длиннее 32 символов'
  if (!LOGIN_PATTERN.test(login)) return 'в логине только латиница, цифры и . _ -'
  return null
}

export function passwordProblem(password: string): string | null {
  if (password === '') return 'нужен пароль'
  if (password.length < MIN_PASSWORD_LENGTH) return 'пароль короче восьми символов'
  return null
}

/** Пробелы по краям от автозамены на телефоне; внутри логина их всё равно не бывает. */
export function normalizeLogin(raw: string): string {
  return raw.trim().toLowerCase()
}

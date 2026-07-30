/**
 * Обёртка над fetch.
 *
 * Сервер отвечает единой формой `{error, message?}` на любую неудачу, поэтому
 * разбор ошибки живёт здесь, а не в каждом сторе.
 */

export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message?: string,
  ) {
    super(message ?? code)
  }
}

/** Понятные человеку подписи к тем ошибкам, которые он реально может увидеть. */
const MESSAGES: Record<string, string> = {
  unauthorized: 'нужно представиться заново',
  room_not_found: 'комната не найдена или уже закрыта',
  wrong_password: 'неверный пароль',
  not_a_member: 'вы не в этой комнате',
  not_allowed: 'это может сделать только хост',
  only_host_may_start: 'начать игру может только хост',
  game_already_active: 'игра уже идёт',
  game_not_active: 'игра уже закончилась',
  bad_player_count: 'играть можно вдвоём и больше',
  entry_already_voided: 'эта запись уже отменена',
  too_many_attempts: 'слишком много попыток, подождите немного',
}

export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    return MESSAGES[error.code] ?? error.message
  }
  return 'не удалось связаться с сервером'
}

let token: string | null = null

export function setToken(next: string | null): void {
  token = next
}

export function getToken(): string | null {
  return token
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: {
        ...(token === null ? {} : { authorization: `Bearer ${token}` }),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError('network', 0, 'нет связи с сервером')
  }

  if (!res.ok) {
    // Ошибку могли вернуть и не в нашем формате — например, прокси на своей странице.
    const payload = (await res.json().catch(() => null)) as
      | { error?: string; message?: string }
      | null
    throw new ApiError(payload?.error ?? 'unknown', res.status, payload?.message)
  }

  return (await res.json()) as T
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
}

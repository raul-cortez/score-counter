import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { makeApp, closeApp, createGuestSession, bearer, type TestApp, type Guest } from './helpers.js'

let ctx: TestApp

beforeEach(async () => {
  ctx = await makeApp()
})

afterEach(async () => {
  await closeApp(ctx)
})

const PASSWORD = 'очень-секретно'

/** Гость, привязавший логин, — с него начинается почти каждая проверка входа. */
async function guestWithLogin(login = 'anya', nickname = 'Аня'): Promise<Guest> {
  const guest = await createGuestSession(ctx.app, nickname)
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/api/auth/upgrade',
    headers: bearer(guest),
    payload: { login, password: PASSWORD },
  })
  if (res.statusCode !== 200) throw new Error(`не удалось привязать логин: ${res.body}`)
  return guest
}

function tryLogin(
  payload: { login: string; password: string },
  headers: Record<string, string> = {},
) {
  return ctx.app.inject({ method: 'POST', url: '/api/auth/login', headers, payload })
}

describe('POST /api/auth/upgrade', () => {
  it('привязывает логин к текущему гостю, сохраняя его id', async () => {
    const guest = await createGuestSession(ctx.app, 'Аня')

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/upgrade',
      headers: bearer(guest),
      payload: { login: 'anya', password: PASSWORD },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({
      id: guest.user.id,
      nickname: 'Аня',
      hasLogin: true,
      activeRoomCode: null,
    })
  })

  /** Ответ этой формы клиент кладёт поверх себя целиком — код комнаты в нём обязателен. */
  it('отдаёт код комнаты, чтобы клиент не забыл, куда возвращаться', async () => {
    const guest = await createGuestSession(ctx.app, 'Аня')
    const room = await ctx.app.inject({
      method: 'POST',
      url: '/api/rooms',
      headers: bearer(guest),
      payload: { name: 'Преферанс' },
    })
    const code = room.json().room.code

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/upgrade',
      headers: bearer(guest),
      payload: { login: 'anya', password: PASSWORD },
    })

    expect(res.json().activeRoomCode).toBe(code)
  })

  it('не хранит пароль в открытом виде', async () => {
    const guest = await guestWithLogin()

    const row = ctx.db
      .prepare('SELECT password_hash FROM users WHERE id = ?')
      .get(guest.user.id) as { password_hash: string }

    expect(row.password_hash).not.toContain(PASSWORD)
    expect(row.password_hash.startsWith('$argon2')).toBe(true)
  })

  it('отклоняет занятый логин', async () => {
    await guestWithLogin('anya')
    const boris = await createGuestSession(ctx.app, 'Борис')

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/upgrade',
      headers: bearer(boris),
      payload: { login: 'anya', password: 'другой-пароль' },
    })

    expect(res.statusCode).toBe(409)
    expect(res.json().error).toBe('login_taken')
  })

  it('не даёт перевязать уже привязанный аккаунт', async () => {
    const guest = await guestWithLogin('anya')

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/upgrade',
      headers: bearer(guest),
      payload: { login: 'other-anya', password: PASSWORD },
    })

    expect(res.statusCode).toBe(409)
    expect(res.json().error).toBe('account_already_linked')
  })

  it('отклоняет короткий пароль', async () => {
    const guest = await createGuestSession(ctx.app, 'Аня')

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/upgrade',
      headers: bearer(guest),
      payload: { login: 'anya', password: 'корот' },
    })

    expect(res.statusCode).toBe(400)
  })

  it('требует авторизации', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/upgrade',
      payload: { login: 'anya', password: PASSWORD },
    })

    expect(res.statusCode).toBe(401)
  })
})

describe('POST /api/auth/login', () => {
  it('выдаёт новый токен для того же пользователя', async () => {
    const guest = await guestWithLogin()

    const res = await tryLogin({ login: 'anya', password: PASSWORD })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.user.id).toBe(guest.user.id)
    expect(body.token).not.toBe(guest.token)
  })

  /** Иначе вернувшийся на новом телефоне попал бы в пустое лобби вместо своего стола. */
  it('отдаёт код активной комнаты, чтобы человек вернулся за свой стол', async () => {
    const guest = await guestWithLogin()
    const room = await ctx.app.inject({
      method: 'POST',
      url: '/api/rooms',
      headers: bearer(guest),
      payload: { name: 'Преферанс' },
    })
    const code = room.json().room.code

    const res = await tryLogin({ login: 'anya', password: PASSWORD })

    expect(res.json().user.activeRoomCode).toBe(code)
  })

  it('узнаёт логин в другом регистре', async () => {
    const guest = await guestWithLogin('anya')

    const res = await tryLogin({ login: 'AnYa', password: PASSWORD })

    expect(res.statusCode).toBe(200)
    expect(res.json().user.id).toBe(guest.user.id)
  })

  it('ставит резервную куку — иначе вход не переживёт чистку хранилища', async () => {
    await guestWithLogin()

    const res = await tryLogin({ login: 'anya', password: PASSWORD })

    expect(res.headers['set-cookie']).toContain(`sid=${res.json().token}`)
  })

  it('отклоняет неверный пароль', async () => {
    await guestWithLogin()

    const res = await tryLogin({ login: 'anya', password: 'неправильный' })

    expect(res.statusCode).toBe(401)
    expect(res.json().error).toBe('invalid_credentials')
  })

  it('отклоняет неизвестный логин тем же ответом, что и неверный пароль', async () => {
    const res = await tryLogin({ login: 'nobody', password: PASSWORD })

    expect(res.statusCode).toBe(401)
    expect(res.json().error).toBe('invalid_credentials')
  })

  it('отклоняет логин, который не набрать с телефона', async () => {
    const res = await tryLogin({ login: 'вообще не логин', password: PASSWORD })

    expect(res.statusCode).toBe(400)
  })

  /**
   * Подбор пароля к аккаунту — единственное, что тут можно перебирать, поэтому
   * счётчик обязателен. Ключ — пара «клиент + логин»: проверим, что соседу по
   * адресу чужой перебор не мешает.
   */
  it('упирается в ограничение частоты после десяти попыток', async () => {
    await guestWithLogin('anya')

    for (let i = 0; i < 10; i += 1) {
      expect((await tryLogin({ login: 'anya', password: 'неправильный' })).statusCode).toBe(401)
    }

    const blocked = await tryLogin({ login: 'anya', password: PASSWORD })
    expect(blocked.statusCode).toBe(429)
    expect(blocked.json().error).toBe('too_many_attempts')
  })

  it('чужой перебор не закрывает вход другому логину с того же адреса', async () => {
    await guestWithLogin('boris')

    for (let i = 0; i < 11; i += 1) await tryLogin({ login: 'anya', password: 'неправильный' })

    const res = await tryLogin({ login: 'boris', password: PASSWORD })
    expect(res.statusCode).toBe(200)
  })
})

describe('POST /api/auth/logout', () => {
  it('гасит сессию: прежним токеном больше не опознать', async () => {
    const guest = await guestWithLogin()

    const out = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: bearer(guest),
    })
    expect(out.statusCode).toBe(200)

    const me = await ctx.app.inject({ method: 'GET', url: '/api/me', headers: bearer(guest) })
    expect(me.statusCode).toBe(401)
  })

  /**
   * Куку гасит только сервер. Если её не тронуть, выход будет половинчатым: клиент
   * забудет токен, а браузер тут же опознается кукой и вернёт человека обратно.
   */
  it('стирает резервную куку', async () => {
    const guest = await guestWithLogin()

    const out = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: bearer(guest),
    })

    const cookie = out.headers['set-cookie'] as string
    expect(cookie).toContain('sid=;')
    expect(cookie).toContain('Max-Age=0')
  })

  it('гасит и сессию, пришедшую одной кукой', async () => {
    const guest = await guestWithLogin()

    await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie: `sid=${guest.token}` },
    })

    const me = await ctx.app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { cookie: `sid=${guest.token}` },
    })
    expect(me.statusCode).toBe(401)
  })
})

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import { request as httpRequest } from 'node:http'
import { makeApp, closeApp, createGuestSession, bearer, type TestApp } from './helpers.js'

let ctx: TestApp
let port: number

/**
 * Здесь поднимается настоящий сокет, а не inject: разбор пустого тела зависит от
 * Content-Length, а inject и fetch выставляют его по-своему. Через них дефект не
 * воспроизводился, и тесты были обманчиво зелёными.
 */
beforeEach(async () => {
  ctx = await makeApp()
  await ctx.app.listen({ port: 0, host: '127.0.0.1' })
  const address = ctx.app.server.address()
  if (address === null || typeof address === 'string') {
    throw new Error('сервер не поднялся на TCP-порту')
  }
  port = address.port
})

afterEach(async () => {
  await closeApp(ctx)
})

type Response = { status: number; body: any }

/** Заголовки задаются вручную, чтобы точно повторить то, что шлёт браузер. */
function raw(path: string, headers: Record<string, string>, payload?: string): Promise<Response> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { host: '127.0.0.1', port, method: 'POST', path, headers },
      (res) => {
        let text = ''
        res.on('data', (chunk) => (text += chunk))
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, body: text ? JSON.parse(text) : null }),
        )
      },
    )
    req.on('error', reject)
    req.end(payload)
  })
}

async function post(path: string, token: string, body: unknown): Promise<Response> {
  const payload = JSON.stringify(body)
  return raw(
    path,
    {
      'content-type': 'application/json',
      'content-length': String(Buffer.byteLength(payload)),
      authorization: `Bearer ${token}`,
    },
    payload,
  )
}

/** Пустое тело с явным Content-Length: 0 — так делают браузер и curl. */
function postEmptyWithLength(path: string, token: string): Promise<Response> {
  return raw(path, {
    'content-type': 'application/json',
    'content-length': '0',
    authorization: `Bearer ${token}`,
  })
}

/** Пустое тело без Content-Length — так делает fetch в Node. */
function postEmptyNoLength(path: string, token: string): Promise<Response> {
  return raw(path, {
    'content-type': 'application/json',
    authorization: `Bearer ${token}`,
  })
}

async function playedGame() {
  const anya = await createGuestSession(ctx.app, 'Аня')
  const boris = await createGuestSession(ctx.app, 'Борис')
  const room = await post('/api/rooms', anya.token, { name: 'Вечер преферанса' })
  const roomCode = room.body.room.code
  await post(`/api/rooms/${roomCode}/join`, boris.token, {})
  const game = await post(`/api/rooms/${roomCode}/games`, anya.token, { scoreLimit: 100 })
  const added = await post(`/api/games/${game.body.game.id}/entries`, boris.token, {
    id: randomUUID(),
    userId: boris.user.id,
    points: 12,
  })
  return { anya, boris, roomCode, entryId: added.body.entry.id }
}

/**
 * Клиенты обычно шлют content-type: application/json на каждый POST через общую
 * обёртку. Маршруты без тела не должны отвечать 400 из-за одного заголовка.
 */
describe('POST без тела с заголовком content-type', () => {
  it('позволяет отменить запись при Content-Length: 0', async () => {
    const { boris, entryId } = await playedGame()

    const res = await postEmptyWithLength(`/api/entries/${entryId}/void`, boris.token)

    expect(res.status).toBe(200)
    expect(res.body.scores[boris.user.id]).toBe(0)
  })

  it('позволяет отменить запись без Content-Length', async () => {
    const { boris, entryId } = await playedGame()

    const res = await postEmptyNoLength(`/api/entries/${entryId}/void`, boris.token)

    expect(res.status).toBe(200)
    expect(res.body.scores[boris.user.id]).toBe(0)
  })

  it('позволяет выйти из комнаты', async () => {
    const { boris, roomCode } = await playedGame()

    const res = await postEmptyWithLength(`/api/rooms/${roomCode}/leave`, boris.token)

    expect(res.status).toBe(200)
  })

  it('всё ещё требует обязательные поля там, где тело нужно', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')

    const res = await postEmptyWithLength('/api/rooms', anya.token)

    expect(res.status).toBe(400)
  })

  it('не ломает обычный запрос с телом', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')

    const res = await post('/api/rooms', anya.token, { name: 'Обычная' })

    expect(res.status).toBe(200)
    expect(res.body.room.name).toBe('Обычная')
  })

  it('отвечает 400 на испорченный JSON, а не падает', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')
    const broken = '{"name": '

    const res = await raw(
      '/api/rooms',
      {
        'content-type': 'application/json',
        'content-length': String(Buffer.byteLength(broken)),
        authorization: `Bearer ${anya.token}`,
      },
      broken,
    )

    expect(res.status).toBe(400)
  })
})

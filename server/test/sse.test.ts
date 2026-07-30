import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { RoomState } from '@score/shared'
import {
  makeLiveApp,
  closeLiveApp,
  openStream,
  type LiveApp,
  type Stream,
} from './sseClient.js'

let live: LiveApp
const streams: Stream[] = []

/** Отсрочка хоста укорочена: иначе тест ждал бы минуту. */
const HOST_GRACE_MS = 150

beforeEach(async () => {
  live = await makeLiveApp({ hostGraceMs: HOST_GRACE_MS })
})

afterEach(async () => {
  streams.forEach((stream) => stream.close())
  streams.length = 0
  await closeLiveApp(live)
})

type Player = { token: string; id: string; nickname: string }

async function api(path: string, token: string, body?: unknown): Promise<any> {
  const res = await fetch(`${live.baseUrl}/api${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${path} → ${res.status} ${await res.text()}`)
  return res.json()
}

async function guest(nickname: string): Promise<Player> {
  const res = await fetch(`${live.baseUrl}/api/auth/guest`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nickname }),
  })
  const { token, user } = (await res.json()) as { token: string; user: { id: string } }
  return { token, id: user.id, nickname }
}

async function subscribe(code: string, player: Player, lastEventId?: number): Promise<Stream> {
  const stream = await openStream(live, code, player.token, lastEventId)
  streams.push(stream)
  return stream
}

/** Стол на двоих: Аня хостит, Борис присоединился. */
async function table() {
  const anya = await guest('Аня')
  const boris = await guest('Борис')
  const created = (await api('/rooms', anya.token, { name: 'Преферанс' })) as RoomState
  const code = created.room.code
  await api(`/rooms/${code}/join`, boris.token, {})
  return { anya, boris, code }
}

describe('поток событий на живом сокете', () => {
  it('отдаёт снимок комнаты первым кадром', async () => {
    const { anya, code } = await table()

    const stream = await subscribe(code, anya)
    const sync = await stream.waitFor((frame) => frame.event === 'sync')

    expect(sync.data.type).toBe('sync')
    expect(sync.data.state.room.code).toBe(code)
    expect(sync.data.state.members.map((m: any) => m.nickname).sort()).toEqual(['Аня', 'Борис'])
    // Подписавшийся видит в снимке самого себя онлайн.
    expect(sync.data.state.online).toContain(anya.id)
  })

  it('доносит чужую запись очков вместе со свежим счётом', async () => {
    const { anya, boris, code } = await table()
    const started = (await api(`/rooms/${code}/games`, anya.token, { scoreLimit: 100 })) as RoomState

    const stream = await subscribe(code, boris)
    await stream.waitFor((frame) => frame.event === 'sync')

    await api(`/games/${started.game!.id}/entries`, anya.token, {
      id: randomUUID(),
      userId: anya.id,
      points: 15,
    })

    const frame = await stream.waitFor((f) => f.event === 'entry_added')

    expect(frame.data.payload.entry.points).toBe(15)
    expect(frame.data.state.game.scores[anya.id]).toBe(15)
    expect(frame.id).toBeGreaterThan(0)
  })

  it('сообщает о победе отдельным событием', async () => {
    const { anya, boris, code } = await table()
    const started = (await api(`/rooms/${code}/games`, anya.token, { scoreLimit: 10 })) as RoomState

    const stream = await subscribe(code, boris)
    await stream.waitFor((frame) => frame.event === 'sync')

    await api(`/games/${started.game!.id}/entries`, anya.token, {
      id: randomUUID(),
      userId: anya.id,
      points: 12,
    })

    const finished = await stream.waitFor((frame) => frame.event === 'game_finished')

    expect(finished.data.payload.winnerUserId).toBe(anya.id)
    expect(finished.data.state.game.status).toBe('finished')
  })

  it('рассказывает остальным о подключении и отключении', async () => {
    const { anya, boris, code } = await table()
    const наблюдатель = await subscribe(code, anya)
    await наблюдатель.waitFor((frame) => frame.event === 'sync')

    const второй = await subscribe(code, boris)
    await наблюдатель.waitFor(
      (frame) => frame.event === 'presence' && frame.data.state.online.includes(boris.id),
    )

    второй.close()

    await наблюдатель.waitFor(
      (frame) => frame.event === 'presence' && !frame.data.state.online.includes(boris.id),
    )
  })

  // Presence не в журнале, поэтому не должен сдвигать точку догрузки.
  it('не нумерует кадры presence', async () => {
    const { anya, boris, code } = await table()
    const stream = await subscribe(code, anya)
    await stream.waitFor((frame) => frame.event === 'sync')

    const второй = await subscribe(code, boris)
    await stream.waitFor((frame) => frame.event === 'presence')
    второй.close()

    expect(stream.received().filter((f) => f.event === 'presence').every((f) => f.id === undefined))
      .toBe(true)
  })

  it('догружает пропущенное после обрыва по Last-Event-ID', async () => {
    const { anya, boris, code } = await table()
    const started = (await api(`/rooms/${code}/games`, anya.token, { scoreLimit: 100 })) as RoomState

    const первое = await subscribe(code, boris)
    const sync = await первое.waitFor((frame) => frame.event === 'sync')
    const точкаОбрыва = sync.id!
    первое.close()

    // Пока Борис в офлайне, Аня успевает записать очки дважды.
    for (const points of [15, 25]) {
      await api(`/games/${started.game!.id}/entries`, anya.token, {
        id: randomUUID(),
        userId: anya.id,
        points,
      })
    }

    const второе = await subscribe(code, boris, точкаОбрыва)

    // Состояние приезжает снимком и уже актуально.
    const пересинхрон = await второе.waitFor((frame) => frame.event === 'sync')
    expect(пересинхрон.data.state.game.scores[anya.id]).toBe(40)

    // А пропущенные дельты — отдельным кадром, ради уведомлений.
    const missed = await второе.waitFor((frame) => frame.event === 'missed')
    const types = missed.data.events.map((event: any) => event.type)
    expect(types).toEqual(['entry_added', 'entry_added'])
    expect(missed.data.events.every((event: any) => event.seq > точкаОбрыва)).toBe(true)
  })

  // Клиент переподключается сам и заголовки выставить не может — только параметр.
  it('принимает точку догрузки параметром запроса, а не только заголовком', async () => {
    const { anya, boris, code } = await table()
    const started = (await api(`/rooms/${code}/games`, anya.token, { scoreLimit: 100 })) as RoomState

    const первое = await subscribe(code, boris)
    const точкаОбрыва = (await первое.waitFor((frame) => frame.event === 'sync')).id!
    первое.close()

    await api(`/games/${started.game!.id}/entries`, anya.token, {
      id: randomUUID(),
      userId: anya.id,
      points: 15,
    })

    const { ticket } = (await (
      await fetch(`${live.baseUrl}/api/rooms/${code}/events/ticket`, {
        method: 'POST',
        headers: { authorization: `Bearer ${boris.token}` },
      })
    ).json()) as { ticket: string }

    const res = await fetch(
      `${live.baseUrl}/api/rooms/${code}/events?ticket=${ticket}&lastEventId=${точкаОбрыва}`,
    )
    const text = await res.body!.getReader().read()
    const chunk = new TextDecoder().decode(text.value)

    expect(chunk).toContain('event: missed')
    await res.body!.cancel().catch(() => undefined)
  })

  it('не шлёт кадр missed, когда клиент ничего не пропустил', async () => {
    const { anya, code } = await table()
    const первое = await subscribe(code, anya)
    const sync = await первое.waitFor((frame) => frame.event === 'sync')
    первое.close()

    const второе = await subscribe(code, anya, sync.id!)
    await второе.waitFor((frame) => frame.event === 'sync')
    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(второе.received().some((frame) => frame.event === 'missed')).toBe(false)
  })
})

describe('автопередача хоста', () => {
  it('отдаёт роль оставшемуся, когда хост не вернулся', async () => {
    const { anya, boris, code } = await table()
    const хост = await subscribe(code, anya)
    await хост.waitFor((frame) => frame.event === 'sync')
    const оставшийся = await subscribe(code, boris)
    await оставшийся.waitFor((frame) => frame.event === 'sync')

    хост.close()

    const changed = await оставшийся.waitFor((frame) => frame.event === 'host_changed')

    expect(changed.data.payload.hostUserId).toBe(boris.id)
    expect(changed.data.state.room.hostUserId).toBe(boris.id)
  })

  it('оставляет роль хосту, если тот вернулся до срока', async () => {
    const { anya, boris, code } = await table()
    const хост = await subscribe(code, anya)
    await хост.waitFor((frame) => frame.event === 'sync')
    const оставшийся = await subscribe(code, boris)
    await оставшийся.waitFor((frame) => frame.event === 'sync')

    хост.close()
    await subscribe(code, anya)

    await new Promise((resolve) => setTimeout(resolve, HOST_GRACE_MS * 3))

    expect(оставшийся.received().some((frame) => frame.event === 'host_changed')).toBe(false)
    const state = (await api(`/rooms/${code}/state`, boris.token)) as RoomState
    expect(state.room.hostUserId).toBe(anya.id)
  })

  // Отдавать роль в пустоту нечестно: комната ждёт, пока кто-нибудь придёт.
  it('ждёт с передачей, пока в комнате никого нет', async () => {
    const { anya, boris, code } = await table()
    const хост = await subscribe(code, anya)
    await хост.waitFor((frame) => frame.event === 'sync')
    хост.close()

    await new Promise((resolve) => setTimeout(resolve, HOST_GRACE_MS * 3))
    const покаНикого = (await api(`/rooms/${code}/state`, boris.token)) as RoomState
    expect(покаНикого.room.hostUserId).toBe(anya.id)

    const пришедший = await subscribe(code, boris)
    const changed = await пришедший.waitFor((frame) => frame.event === 'host_changed')

    expect(changed.data.payload.hostUserId).toBe(boris.id)
  })
})

describe('доступ к потоку', () => {
  it('не пускает без билета', async () => {
    const { code } = await table()
    const res = await fetch(`${live.baseUrl}/api/rooms/${code}/events`)

    expect(res.status).toBe(401)
  })

  it('сжигает билет после первого подключения', async () => {
    const { anya, code } = await table()
    const ticketRes = await fetch(`${live.baseUrl}/api/rooms/${code}/events/ticket`, {
      method: 'POST',
      headers: { authorization: `Bearer ${anya.token}` },
    })
    const { ticket } = (await ticketRes.json()) as { ticket: string }
    const url = `${live.baseUrl}/api/rooms/${code}/events?ticket=${ticket}`

    const first = await fetch(url)
    expect(first.status).toBe(200)
    await first.body!.cancel()

    const second = await fetch(url)
    expect(second.status).toBe(401)
  })

  it('не выдаёт билет постороннему', async () => {
    const { code } = await table()
    const чужак = await guest('Чужак')

    const res = await fetch(`${live.baseUrl}/api/rooms/${code}/events/ticket`, {
      method: 'POST',
      headers: { authorization: `Bearer ${чужак.token}` },
    })

    expect(res.status).toBe(403)
  })

  it('отдаёт заголовки, которые не дают прокси буферизовать поток', async () => {
    const { anya, code } = await table()
    const ticketRes = await fetch(`${live.baseUrl}/api/rooms/${code}/events/ticket`, {
      method: 'POST',
      headers: { authorization: `Bearer ${anya.token}` },
    })
    const { ticket } = (await ticketRes.json()) as { ticket: string }

    const res = await fetch(`${live.baseUrl}/api/rooms/${code}/events?ticket=${ticket}`)

    expect(res.headers.get('content-type')).toContain('text/event-stream')
    expect(res.headers.get('cache-control')).toContain('no-cache')
    expect(res.headers.get('x-accel-buffering')).toBe('no')
    await res.body!.cancel()
  })
})

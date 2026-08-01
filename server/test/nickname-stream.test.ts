import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { RoomState } from '@score/shared'
import { makeLiveApp, closeLiveApp, openStream, type LiveApp, type Stream } from './sseClient.js'

let live: LiveApp
const streams: Stream[] = []

beforeEach(async () => {
  live = await makeLiveApp()
})

afterEach(async () => {
  streams.forEach((stream) => stream.close())
  streams.length = 0
  await closeLiveApp(live)
})

type Player = { token: string; id: string }

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
  return { token, id: user.id }
}

describe('смена имени в живой комнате', () => {
  it('доходит до соседа кадром и меняет имя в его снимке', async () => {
    const anya = await guest('Аня')
    const boris = await guest('Борис')
    const created = (await api('/rooms', anya.token, { name: 'Преферанс' })) as RoomState
    const code = created.room.code
    await api(`/rooms/${code}/join`, boris.token, {})

    const stream = await openStream(live, code, boris.token)
    streams.push(stream)
    await stream.waitFor((frame) => frame.event === 'sync')

    await api('/me/nickname', anya.token, { nickname: 'Аня Б.' })

    const frame = await stream.waitFor((f) => f.event === 'member_renamed')
    expect(frame.data.payload).toEqual({
      userId: anya.id,
      nickname: 'Аня Б.',
      previous: 'Аня',
    })
    // Снимок приезжает с тем же кадром: сосед перерисовывает состав, не запрашивая его.
    expect(
      frame.data.state.members.find((member: any) => member.id === anya.id).nickname,
    ).toBe('Аня Б.')
  })

  it('вне комнаты никого не беспокоит', async () => {
    const anya = await guest('Аня')
    const boris = await guest('Борис')
    const created = (await api('/rooms', boris.token, { name: 'Чужая' })) as RoomState
    const code = created.room.code

    const stream = await openStream(live, code, boris.token)
    streams.push(stream)
    await stream.waitFor((frame) => frame.event === 'sync')

    // Аня в этой комнате не состоит — её переименование к столу отношения не имеет.
    await api('/me/nickname', anya.token, { nickname: 'Аня Б.' })
    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(stream.received().some((frame) => frame.event === 'member_renamed')).toBe(false)
  })
})

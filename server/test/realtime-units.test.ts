import { describe, it, expect, vi } from 'vitest'
import { createRegistry, type Connection } from '../src/realtime/registry.js'
import { createTickets } from '../src/realtime/tickets.js'
import { formatFrame } from '../src/realtime/sse.js'

function conn(userId: string): Connection & { sent: string[] } {
  const sent: string[] = []
  return { userId, sent, write: (chunk) => sent.push(chunk) }
}

describe('реестр соединений', () => {
  it('рассылает всем подписчикам комнаты', () => {
    const registry = createRegistry()
    const anna = conn('anna')
    const boris = conn('boris')
    registry.add('room', anna)
    registry.add('room', boris)

    registry.broadcast('room', 'кадр')

    expect(anna.sent).toEqual(['кадр'])
    expect(boris.sent).toEqual(['кадр'])
  })

  it('не задевает соседние комнаты', () => {
    const registry = createRegistry()
    const свой = conn('anna')
    const чужой = conn('boris')
    registry.add('room', свой)
    registry.add('другая', чужой)

    registry.broadcast('room', 'кадр')

    expect(чужой.sent).toEqual([])
  })

  // Две вкладки одного человека — один онлайн; закрытие одной не гасит присутствие.
  it('схлопывает вкладки одного пользователя', () => {
    const registry = createRegistry()
    const первая = conn('anna')
    const вторая = conn('anna')
    registry.add('room', первая)
    registry.add('room', вторая)

    expect(registry.onlineUserIds('room')).toEqual(['anna'])

    registry.remove('room', первая)

    expect(registry.onlineUserIds('room')).toEqual(['anna'])
    expect(registry.isOnline('room', 'anna')).toBe(true)
  })

  it('убирает пользователя из онлайна после последнего соединения', () => {
    const registry = createRegistry()
    const anna = conn('anna')
    registry.add('room', anna)

    registry.remove('room', anna)

    expect(registry.onlineUserIds('room')).toEqual([])
  })

  it('сообщает об изменении состава при подключении и отключении', () => {
    const onPresenceChange = vi.fn()
    const registry = createRegistry({ onPresenceChange })
    const anna = conn('anna')

    registry.add('room', anna)
    registry.remove('room', anna)

    expect(onPresenceChange.mock.calls).toEqual([['room'], ['room']])
  })

  it('молчит, когда убирают то, чего нет', () => {
    const onPresenceChange = vi.fn()
    const registry = createRegistry({ onPresenceChange })

    registry.remove('room', conn('anna'))

    expect(onPresenceChange).not.toHaveBeenCalled()
  })

  // Одна мёртвая вкладка не должна лишать остальных обновлений.
  it('выбрасывает соединение, чья запись упала, и дорассылает остальным', () => {
    const registry = createRegistry()
    const мёртвое: Connection = {
      userId: 'anna',
      write: () => {
        throw new Error('socket closed')
      },
    }
    const живое = conn('boris')
    registry.add('room', мёртвое)
    registry.add('room', живое)

    registry.broadcast('room', 'кадр')

    expect(живое.sent).toEqual(['кадр'])
    expect(registry.onlineUserIds('room')).toEqual(['boris'])
  })
})

describe('билеты на подключение', () => {
  it('обменивает билет на его владельца', () => {
    const tickets = createTickets()
    const ticket = tickets.issue({ userId: 'anna', roomId: 'room' })

    expect(tickets.redeem(ticket)).toEqual({ userId: 'anna', roomId: 'room' })
  })

  it('сжигает билет при первом предъявлении', () => {
    const tickets = createTickets()
    const ticket = tickets.issue({ userId: 'anna', roomId: 'room' })

    tickets.redeem(ticket)

    expect(tickets.redeem(ticket)).toBeNull()
  })

  it('отвергает просроченный билет', () => {
    let now = 1_000
    const tickets = createTickets({ ttlMs: 100, now: () => now })
    const ticket = tickets.issue({ userId: 'anna', roomId: 'room' })

    now += 101

    expect(tickets.redeem(ticket)).toBeNull()
  })

  it('отвергает выдуманный билет', () => {
    expect(createTickets().redeem('нет такого')).toBeNull()
  })

  it('выдаёт разные билеты на один и тот же запрос', () => {
    const tickets = createTickets()
    const claim = { userId: 'anna', roomId: 'room' }

    expect(tickets.issue(claim)).not.toBe(tickets.issue(claim))
  })
})

describe('формат кадра', () => {
  it('ставит id только там, где он задан', () => {
    expect(formatFrame({ event: 'entry_added', data: { a: 1 }, id: 42 })).toBe(
      'id: 42\nevent: entry_added\ndata: {"a":1}\n\n',
    )
    expect(formatFrame({ event: 'presence', data: { a: 1 } })).toBe(
      'event: presence\ndata: {"a":1}\n\n',
    )
  })

  // Перевод строки внутри data оборвал бы кадр на середине.
  it('держит данные в одной строке даже с переносами внутри', () => {
    const frame = formatFrame({ event: 'sync', data: { nickname: 'Аня\nБоря' } })

    expect(frame.split('\n').filter((line) => line.startsWith('data: '))).toHaveLength(1)
    expect(frame.endsWith('\n\n')).toBe(true)
  })
})

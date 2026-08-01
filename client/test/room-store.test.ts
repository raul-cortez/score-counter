import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { NOTICE_TTL_MS, useRoomStore } from '../src/stores/room.js'
import { ANYA, BORIS, VERA, entry, game, roomState } from './fixtures.js'

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('стор комнаты', () => {
  it('берёт состояние из кадра синхронизации', () => {
    const store = useRoomStore()

    store.apply({ type: 'sync', seq: 7, state: roomState() })

    expect(store.state?.room.code).toBe('ABC234')
    expect(store.players.map((player) => player.nickname)).toEqual(['Аня', 'Борис'])
  })

  // Снимок в кадре — единственный источник состояния: дельты стор не применяет.
  it('заменяет состояние снимком из события, а не пересчитывает сам', () => {
    const store = useRoomStore()
    store.apply({ type: 'sync', seq: 1, state: roomState() })

    const свежее = roomState({
      game: game({ entries: [entry({ points: 15 }), entry({ id: 'e-2', seq: 2, points: 25 })] }),
    })
    store.apply({
      type: 'entry_added',
      seq: 2,
      payload: { entry: entry({ id: 'e-2', points: 25 }) },
      state: свежее,
    })

    expect(store.state?.game?.scores[ANYA.id]).toBe(40)
  })

  it('обновляет онлайн из кадра присутствия', () => {
    const store = useRoomStore()
    store.apply({ type: 'sync', seq: 1, state: roomState({ online: [ANYA.id] }) })

    store.apply({ type: 'presence', state: roomState({ online: [ANYA.id, BORIS.id] }) })

    expect(store.state?.online).toEqual([ANYA.id, BORIS.id])
  })

  it('называет людей по именам в уведомлениях, а не идентификаторами', () => {
    const store = useRoomStore()
    store.apply({ type: 'sync', seq: 1, state: roomState({ members: [ANYA, BORIS, VERA] }) })

    store.apply({
      type: 'host_changed',
      seq: 2,
      payload: { hostUserId: VERA.id, previous: ANYA.id },
      state: roomState({ members: [ANYA, BORIS, VERA] }),
    })

    const text = store.notices.at(-1)!.text
    expect(text).toContain('Вера')
    expect(text).not.toContain(VERA.id)
  })

  // Ушедший остаётся в составе игры, и его очки продолжают показываться.
  it('находит имя того, кто вышел из комнаты, но остался в игре', () => {
    const store = useRoomStore()
    store.apply({
      type: 'sync',
      seq: 1,
      state: roomState({ members: [ANYA], game: game({ players: [ANYA, BORIS] }) }),
    })

    expect(store.nameOf(BORIS.id)).toBe('Борис')
  })

  it('молчит о синхронизации и присутствии', () => {
    const store = useRoomStore()

    store.apply({ type: 'sync', seq: 1, state: roomState() })
    store.apply({ type: 'presence', state: roomState() })

    expect(store.notices).toHaveLength(0)
  })

  it('кадр о пропущенном не трогает состояние', () => {
    const store = useRoomStore()
    store.apply({ type: 'sync', seq: 1, state: roomState() })
    const было = store.state

    store.apply({
      type: 'missed',
      events: [{ seq: 2, type: 'entry_added', payload: {}, createdAt: 0 }],
    })

    expect(store.state).toBe(было)
    expect(store.notices.at(-1)!.text).toContain('1')
  })

  it('не копит уведомления без предела', () => {
    const store = useRoomStore()
    store.apply({ type: 'sync', seq: 1, state: roomState() })

    for (let i = 0; i < 20; i++) {
      store.apply({
        type: 'member_joined',
        seq: i + 2,
        payload: { userId: BORIS.id },
        state: roomState(),
      })
    }

    expect(store.notices.length).toBeLessThanOrEqual(5)
  })

  it('сбрасывает всё при выходе из комнаты', () => {
    const store = useRoomStore()
    store.apply({ type: 'sync', seq: 1, state: roomState() })

    store.reset()

    expect(store.state).toBeNull()
    expect(store.notices).toEqual([])
    expect(store.status).toBe('offline')
  })
})

describe('уведомления уходят сами', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function joined(store: ReturnType<typeof useRoomStore>, seq: number): void {
    store.apply({
      type: 'member_joined',
      seq,
      payload: { userId: BORIS.id },
      state: roomState(),
    })
  }

  it('снимаются через отведённый срок без единого клика', () => {
    const store = useRoomStore()
    store.apply({ type: 'sync', seq: 1, state: roomState() })
    joined(store, 2)
    expect(store.notices).toHaveLength(1)

    vi.advanceTimersByTime(NOTICE_TTL_MS - 1)
    expect(store.notices).toHaveLength(1)

    vi.advanceTimersByTime(1)
    expect(store.notices).toHaveLength(0)
  })

  it('каждое живёт свой срок, а не гаснет вместе с соседом', () => {
    const store = useRoomStore()
    store.apply({ type: 'sync', seq: 1, state: roomState() })

    joined(store, 2)
    vi.advanceTimersByTime(NOTICE_TTL_MS - 1000)
    joined(store, 3)

    vi.advanceTimersByTime(1000)
    expect(store.notices).toHaveLength(1)

    vi.advanceTimersByTime(NOTICE_TTL_MS - 1000)
    expect(store.notices).toHaveLength(0)
  })

  it('клик убирает раньше срока и не оставляет таймер на чужое место', () => {
    const store = useRoomStore()
    store.apply({ type: 'sync', seq: 1, state: roomState() })
    joined(store, 2)

    store.dismiss(store.notices[0].id)
    expect(store.notices).toHaveLength(0)

    joined(store, 3)
    vi.advanceTimersByTime(NOTICE_TTL_MS - 1)
    // Таймер снятого уведомления не должен погасить следующее раньше времени.
    expect(store.notices).toHaveLength(1)
  })

  it('выход из комнаты не оставляет тикающих таймеров', () => {
    const store = useRoomStore()
    store.apply({ type: 'sync', seq: 1, state: roomState() })
    joined(store, 2)

    store.reset()
    joined(store, 3)

    vi.advanceTimersByTime(NOTICE_TTL_MS - 1)
    expect(store.notices).toHaveLength(1)
  })
})

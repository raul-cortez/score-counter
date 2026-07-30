import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { mount, flushPromises, RouterLinkStub } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import type { GameHistoryDetails, GameHistoryItem, MyStats } from '@score/shared'
import HistoryView from '../src/views/HistoryView.vue'
import GameDetailView from '../src/views/GameDetailView.vue'
import { useSessionStore } from '../src/stores/session.js'
import { ANYA, BORIS, VERA, entry } from './fixtures.js'
import { formatPlayedAt } from '../src/formatDate.js'

// Экран разбора берёт идентификатор через useRoute(), а не через this.$route,
// поэтому мокается сам composable, а не свойство компонента.
vi.mock('vue-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-router')>()),
  useRoute: () => ({ params: { gameId: 'g-1' } }),
}))

const UUID_LIKE = /\bu-[a-z]+\b|[0-9a-f]{8}-[0-9a-f]{4}/i

const GAMES: GameHistoryItem[] = [
  {
    id: 'g-1',
    roomName: 'Преферанс',
    roomCode: 'ABC234',
    scoreLimit: 100,
    status: 'finished',
    startedAt: 1_700_000_000_000,
    finishedAt: 1_700_000_100_000,
    winnerUserId: ANYA.id,
    myScore: 101,
    players: [ANYA, BORIS],
  },
  {
    id: 'g-2',
    roomName: 'Дурак',
    roomCode: 'XYZ789',
    scoreLimit: 50,
    status: 'finished',
    startedAt: 1_699_000_000_000,
    finishedAt: 1_699_000_100_000,
    winnerUserId: BORIS.id,
    myScore: 20,
    players: [ANYA, BORIS, VERA],
  },
]

const STATS: MyStats = {
  gamesPlayed: 2,
  wins: 1,
  bestScore: 101,
  opponents: [
    { user: BORIS, games: 2, theirWins: 1 },
    { user: VERA, games: 1, theirWins: 0 },
  ],
}

const DETAILS: GameHistoryDetails = {
  id: 'g-1',
  roomName: 'Преферанс',
  roomCode: 'ABC234',
  scoreLimit: 100,
  status: 'finished',
  startedAt: 1_700_000_000_000,
  finishedAt: 1_700_000_100_000,
  winnerUserId: ANYA.id,
  players: [ANYA, BORIS],
  entries: [
    entry({ id: 'e-1', userId: ANYA.id, points: 101 }),
    entry({ id: 'e-2', seq: 2, userId: BORIS.id, points: 30, voidedAt: 1, voidedBy: BORIS.id }),
  ],
  scores: { [ANYA.id]: 101, [BORIS.id]: 0 },
}

function stubFetch(routes: Record<string, unknown>): void {
  vi.stubGlobal('fetch', async (input: string) => {
    const path = String(input).replace('/api', '')
    const body = routes[path]
    if (body === undefined) throw new Error(`неожиданный запрос: ${input}`)
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  })
}

const global = { stubs: { RouterLink: RouterLinkStub } }

beforeEach(() => {
  setActivePinia(createPinia())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('экран истории', () => {
  beforeEach(() => {
    stubFetch({ '/me/games': GAMES, '/me/stats': STATS })
    useSessionStore().user = { ...ANYA, activeRoomCode: null }
  })

  it('показывает сводку', async () => {
    const screen = mount(HistoryView, { global })
    await flushPromises()

    const values = screen.findAll('.stat-value').map((node) => node.text())
    expect(values).toEqual(['2', '1', '101'])
  })

  it('перечисляет партии с соперниками и исходом', async () => {
    const screen = mount(HistoryView, { global })
    await flushPromises()

    const text = screen.text()
    expect(text).toContain('Преферанс')
    expect(text).toContain('Дурак')
    expect(text).toContain('победа')
    expect(text).toContain('поражение')
    expect(text).toContain('Борис')
  })

  it('не показывает вас среди ваших же соперников по партии', async () => {
    const screen = mount(HistoryView, { global })
    await flushPromises()

    expect(screen.findAll('.game-with').map((node) => node.text())).toEqual([
      'с Борис',
      'с Борис, Вера',
    ])
  })

  it('не выпускает идентификаторы на экран', async () => {
    const screen = mount(HistoryView, { global })
    await flushPromises()

    expect(screen.text()).not.toMatch(UUID_LIKE)
  })

  it('ведёт на разбор партии', async () => {
    const screen = mount(HistoryView, { global })
    await flushPromises()

    const links = screen.findAllComponents(RouterLinkStub).map((link) => link.props('to'))
    expect(links).toContain('/history/g-1')
  })

  it('новичку говорит, что пусто, а не показывает поломанный экран', async () => {
    stubFetch({
      '/me/games': [],
      '/me/stats': { gamesPlayed: 0, wins: 0, bestScore: 0, opponents: [] },
    })

    const screen = mount(HistoryView, { global })
    await flushPromises()

    expect(screen.text()).toContain('Пока пусто')
  })
})

describe('разбор партии', () => {
  beforeEach(() => {
    stubFetch({ '/games/g-1': DETAILS })
    useSessionStore().user = { ...ANYA, activeRoomCode: null }
  })

  const mountDetail = () => mount(GameDetailView, { global })

  it('показывает итог и раздачи по именам', async () => {
    const screen = mountDetail()
    await flushPromises()

    expect(screen.text()).toContain('Преферанс')
    expect(screen.findAll('.place')[0].text()).toContain('Аня')
    expect(screen.findAll('.entry')).toHaveLength(2)
    expect(screen.text()).not.toMatch(UUID_LIKE)
  })

  it('оставляет отменённую раздачу видимой и помеченной', async () => {
    const screen = mountDetail()
    await flushPromises()

    const voided = screen.findAll('.entry').find((row) => row.classes('voided'))
    expect(voided?.text()).toContain('отменено')
    expect(voided?.text()).toContain('Борис')
  })
})

describe('дата партии', () => {
  const день = 86_400_000
  const now = new Date(2026, 6, 30, 21, 0).getTime()

  it('называет сегодня и вчера словами', () => {
    expect(formatPlayedAt(new Date(2026, 6, 30, 19, 30).getTime(), now)).toBe('сегодня в 19:30')
    expect(formatPlayedAt(new Date(2026, 6, 29, 19, 30).getTime(), now)).toBe('вчера в 19:30')
  })

  // Разница «меньше суток» и «вчера» — не одно и то же: в час ночи вчерашним
  // становится всё, что было прошлым вечером.
  it('считает по календарным дням, а не по прошедшим часам', () => {
    const заПолночь = new Date(2026, 6, 31, 0, 30).getTime()
    expect(formatPlayedAt(new Date(2026, 6, 30, 23, 30).getTime(), заПолночь)).toContain('вчера')
  })

  it('для давних партий показывает дату', () => {
    expect(formatPlayedAt(now - день * 10, now)).toContain('июля')
  })
})

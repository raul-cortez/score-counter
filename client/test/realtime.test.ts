import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  openRoomStream,
  retryDelay,
  OFFLINE_AFTER_ATTEMPTS,
  SILENCE_LIMIT_MS,
  WAKE_STALE_MS,
  type ConnectionStatus,
} from '../src/realtime.js'
import { roomState } from './fixtures.js'

/** Подделка EventSource: тест сам решает, когда соединение открылось и когда упало. */
class FakeEventSource {
  static opened: FakeEventSource[] = []

  onopen: (() => void) | null = null
  onerror: (() => void) | null = null
  closed = false
  private listeners = new Map<string, ((event: MessageEvent<string>) => void)[]>()

  constructor(readonly url: string) {
    FakeEventSource.opened.push(this)
  }

  addEventListener(type: string, handler: (event: MessageEvent<string>) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), handler])
  }

  close(): void {
    this.closed = true
  }

  open(): void {
    this.onopen?.()
  }

  fail(): void {
    this.onerror?.()
  }

  emit(type: string, data: unknown, id?: number): void {
    const event = { data: JSON.stringify(data), lastEventId: id === undefined ? '' : String(id) }
    for (const handler of this.listeners.get(type) ?? []) {
      handler(event as MessageEvent<string>)
    }
  }
}

let ticketCalls = 0

beforeEach(() => {
  FakeEventSource.opened = []
  ticketCalls = 0
  vi.stubGlobal('fetch', async (input: string) => {
    if (String(input).endsWith('/events/ticket')) {
      ticketCalls += 1
      return new Response(JSON.stringify({ ticket: `t${ticketCalls}`, expiresIn: 30_000 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    throw new Error(`неожиданный запрос: ${input}`)
  })
})

afterEach(() => {
  // Потоки живут на слушателях окна: незакрытый поток чужого теста услышал бы
  // пробуждение экрана в следующем и полез бы подключаться.
  opened.forEach((stream) => stream.close())
  opened.length = 0
  vi.unstubAllGlobals()
})

/** Даёт отработать промису получения билета внутри подключения. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

/** Открытые в тесте потоки — чтобы закрыть их все разом. */
const opened: { close: () => void }[] = []

function start() {
  const frames: unknown[] = []
  const statuses: ConnectionStatus[] = []
  const timers: (() => void)[] = []
  const watchdogs: (() => void)[] = []
  let clock = 0

  const stream = openRoomStream(
    'ABC234',
    { onFrame: (frame) => frames.push(frame), onStatus: (s) => statuses.push(s) },
    {
      createEventSource: (url) => new FakeEventSource(url) as unknown as EventSource,
      // Отступы не отсчитываем по-настоящему: тест сам решает, когда повторять.
      setTimeoutFn: ((fn: () => void) => {
        timers.push(fn)
        return 0
      }) as unknown as typeof setTimeout,
      setIntervalFn: ((fn: () => void) => {
        watchdogs.push(fn)
        return 0
      }) as unknown as typeof setInterval,
      now: () => clock,
    },
  )

  opened.push(stream)

  return {
    stream,
    frames,
    statuses,
    timers,
    watchdogs,
    sources: FakeEventSource.opened,
    advance: (ms: number) => {
      clock += ms
    },
    tickWatchdog: () => watchdogs.forEach((fn) => fn()),
  }
}

describe('поток комнаты', () => {
  it('берёт билет и подключается', async () => {
    const ctx = start()
    await settle()

    expect(ticketCalls).toBe(1)
    expect(ctx.sources).toHaveLength(1)
    expect(ctx.sources[0].url).toContain('ticket=t1')
  })

  it('сообщает о живой связи после открытия', async () => {
    const ctx = start()
    await settle()

    ctx.sources[0].open()

    expect(ctx.statuses.at(-1)).toBe('live')
  })

  it('разбирает именованные кадры', async () => {
    const ctx = start()
    await settle()
    ctx.sources[0].open()

    const state = roomState()
    ctx.sources[0].emit('sync', { type: 'sync', seq: 7, state }, 7)

    expect(ctx.frames).toHaveLength(1)
    expect((ctx.frames[0] as { seq: number }).seq).toBe(7)
  })

  // Билет одноразовый, поэтому вторая попытка обязана взять новый.
  it('берёт свежий билет на каждое переподключение', async () => {
    const ctx = start()
    await settle()
    ctx.sources[0].open()

    ctx.sources[0].fail()
    ctx.timers.at(-1)!()
    await settle()

    expect(ticketCalls).toBe(2)
    expect(ctx.sources).toHaveLength(2)
    expect(ctx.sources[1].url).toContain('ticket=t2')
  })

  it('просит после обрыва только пропущенное', async () => {
    const ctx = start()
    await settle()
    ctx.sources[0].open()
    ctx.sources[0].emit('sync', { type: 'sync', seq: 12, state: roomState() }, 12)

    ctx.sources[0].fail()
    ctx.timers.at(-1)!()
    await settle()

    expect(ctx.sources[1].url).toContain('lastEventId=12')
  })

  it('в первый раз точку догрузки не указывает', async () => {
    const ctx = start()
    await settle()

    expect(ctx.sources[0].url).not.toContain('lastEventId')
  })

  // Секундный обрыв — обычное дело в дороге; пугать им человека не за что.
  it('короткий обрыв показывает как «подключаемся», а не как потерю связи', async () => {
    const ctx = start()
    await settle()
    ctx.sources[0].open()

    ctx.sources[0].fail()

    expect(ctx.statuses.at(-1)).toBe('connecting')
  })

  it('говорит о потере связи, когда попытки подряд не помогают', async () => {
    const ctx = start()
    await settle()
    ctx.sources[0].open()

    for (let i = 0; i <= OFFLINE_AFTER_ATTEMPTS; i++) {
      ctx.sources.at(-1)!.fail()
      ctx.timers.at(-1)!()
      await settle()
    }

    expect(ctx.statuses.at(-1)).toBe('offline')
  })

  it('разводит попытки во времени, а не долбит подряд', () => {
    expect(retryDelay(0)).toBeLessThan(retryDelay(3))
    expect(retryDelay(99)).toBe(retryDelay(4))
  })

  // Соединение может остаться открытым, когда на том конце уже никого нет:
  // так ведёт себя и прокси, и телефон, потерявший сеть.
  it('переподключается, если поток замолчал надолго', async () => {
    const ctx = start()
    await settle()
    ctx.sources[0].open()

    ctx.advance(SILENCE_LIMIT_MS + 1)
    ctx.tickWatchdog()

    expect(ctx.sources[0].closed).toBe(true)
    expect(ctx.statuses.at(-1)).toBe('connecting')
  })

  /*
   * Телефон, уснув, замораживает таймеры и сокеты. Раньше после пробуждения
   * приложение ждало очередной попытки по расписанию — до десяти секунд с
   * надписью «нет связи» поверх живой сети.
   */
  describe('пробуждение экрана', () => {
    it('переподключается сразу, не дожидаясь отложенной попытки', async () => {
      const ctx = start()
      await settle()
      ctx.sources[0].open()
      ctx.sources[0].fail()
      const afterFail = ctx.sources.length

      ctx.advance(WAKE_STALE_MS + 1)
      document.dispatchEvent(new Event('visibilitychange'))
      await settle()

      expect(ctx.sources.length).toBe(afterFail + 1)
      expect(ctx.statuses.at(-1)).toBe('connecting')
    })

    it('отложенная попытка после пробуждения второго соединения не открывает', async () => {
      const ctx = start()
      await settle()
      ctx.sources[0].open()
      ctx.sources[0].fail()

      ctx.advance(WAKE_STALE_MS + 1)
      document.dispatchEvent(new Event('visibilitychange'))
      await settle()
      const opened = ctx.sources.length

      // Таймер, поставленный до пробуждения, срабатывает уже вхолостую.
      ctx.timers.forEach((fire) => fire())
      await settle()

      expect(ctx.sources.length).toBe(opened)
    })

    it('живой поток не трогает: незачем рвать рабочее соединение', async () => {
      const ctx = start()
      await settle()
      ctx.sources[0].open()
      const opened = ctx.sources.length

      document.dispatchEvent(new Event('visibilitychange'))
      await settle()

      expect(ctx.sources.length).toBe(opened)
      expect(ctx.sources[0].closed).toBe(false)
    })

    it('после закрытия потока на пробуждение не реагирует', async () => {
      const ctx = start()
      await settle()
      ctx.sources[0].open()
      ctx.stream.close()
      const opened = ctx.sources.length

      ctx.advance(WAKE_STALE_MS + 1)
      document.dispatchEvent(new Event('visibilitychange'))
      await settle()

      expect(ctx.sources.length).toBe(opened)
    })
  })

  it('считает поток живым, пока приходит ping', async () => {
    const ctx = start()
    await settle()
    ctx.sources[0].open()

    for (let i = 0; i < 4; i++) {
      ctx.advance(SILENCE_LIMIT_MS / 2)
      ctx.sources[0].emit('ping', {})
      ctx.tickWatchdog()
    }

    expect(ctx.sources[0].closed).toBe(false)
    expect(ctx.statuses.at(-1)).toBe('live')
  })

  it('любое событие тоже подтверждает, что связь жива', async () => {
    const ctx = start()
    await settle()
    ctx.sources[0].open()

    ctx.advance(SILENCE_LIMIT_MS / 2)
    ctx.sources[0].emit('sync', { type: 'sync', seq: 1, state: roomState() }, 1)
    ctx.advance(SILENCE_LIMIT_MS / 2)
    ctx.tickWatchdog()

    expect(ctx.sources[0].closed).toBe(false)
  })

  it('после закрытия больше не подключается', async () => {
    const ctx = start()
    await settle()
    ctx.sources[0].open()

    ctx.stream.close()
    ctx.sources[0].fail()
    ctx.timers.forEach((fn) => fn())
    await settle()

    expect(ctx.sources).toHaveLength(1)
    expect(ctx.sources[0].closed).toBe(true)
  })
})

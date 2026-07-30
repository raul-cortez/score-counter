import type { FastifyInstance } from 'fastify'
import type { AddressInfo } from 'node:net'
import { openDb, type Db } from '../src/db/index.js'
import { buildApp, type AppOptions } from '../src/app.js'

/**
 * Настоящий сервер на настоящем порту.
 *
 * app.inject() потоковые ответы не воспроизводит, а порт 0 снимает всю возню с
 * занятыми портами и осиротевшими процессами: ядро выдаёт свободный само.
 */
export type LiveApp = { app: FastifyInstance; db: Db; baseUrl: string }

export async function makeLiveApp(options: AppOptions = {}): Promise<LiveApp> {
  const db = openDb(':memory:')
  const app = buildApp(db, options)
  await app.listen({ port: 0, host: '127.0.0.1' })

  const { port } = app.server.address() as AddressInfo
  return { app, db, baseUrl: `http://127.0.0.1:${port}` }
}

export async function closeLiveApp({ app, db }: LiveApp): Promise<void> {
  await app.close()
  db.close()
}

export type Frame = { id?: number; event: string; data: any }

export type Stream = {
  /** Ждёт первый кадр, подходящий под условие, включая уже пришедшие. */
  waitFor: (predicate: (frame: Frame) => boolean, timeoutMs?: number) => Promise<Frame>
  received: () => Frame[]
  /** Последний виденный id — то, что браузер прислал бы в Last-Event-ID. */
  lastEventId: () => number | undefined
  close: () => void
}

function parseFrames(chunk: string): Frame[] {
  return chunk
    .split('\n\n')
    .filter((block) => block.trim() !== '' && !block.startsWith(':'))
    .map((block) => {
      const frame: Frame = { event: 'message', data: undefined }
      for (const line of block.split('\n')) {
        if (line.startsWith('id: ')) frame.id = Number(line.slice(4))
        if (line.startsWith('event: ')) frame.event = line.slice(7)
        if (line.startsWith('data: ')) frame.data = JSON.parse(line.slice(6))
      }
      return frame
    })
}

/** Подписка на поток комнаты. Билет одноразовый, поэтому берётся на каждое подключение. */
export async function openStream(
  live: LiveApp,
  code: string,
  token: string,
  lastEventId?: number,
): Promise<Stream> {
  const ticketRes = await fetch(`${live.baseUrl}/api/rooms/${code}/events/ticket`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
  })
  if (!ticketRes.ok) {
    throw new Error(`билет не выдан: ${ticketRes.status} ${await ticketRes.text()}`)
  }
  const { ticket } = (await ticketRes.json()) as { ticket: string }

  const controller = new AbortController()
  const headers: Record<string, string> =
    lastEventId === undefined ? {} : { 'last-event-id': String(lastEventId) }

  const res = await fetch(`${live.baseUrl}/api/rooms/${code}/events?ticket=${ticket}`, {
    headers,
    signal: controller.signal,
  })
  if (!res.ok || res.body === null) {
    throw new Error(`поток не открылся: ${res.status}`)
  }

  // Забираем тело в локальную переменную: внутри замыкания проверка выше уже не сужает тип.
  const body = res.body
  const frames: Frame[] = []
  const listeners = new Set<() => void>()
  let seen: number | undefined

  void (async () => {
    const reader = body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        // Кадр считается принятым только после пустой строки — хвост остаётся в буфере.
        const boundary = buffer.lastIndexOf('\n\n')
        if (boundary === -1) continue
        const complete = buffer.slice(0, boundary + 2)
        buffer = buffer.slice(boundary + 2)

        for (const frame of parseFrames(complete)) {
          frames.push(frame)
          if (frame.id !== undefined) seen = frame.id
        }
        for (const notify of [...listeners]) notify()
      }
    } catch {
      // Обрыв по close() — ожидаемое завершение чтения.
    }
  })()

  return {
    received: () => [...frames],
    lastEventId: () => seen,
    close: () => controller.abort(),

    waitFor(predicate, timeoutMs = 2000) {
      return new Promise<Frame>((resolve, reject) => {
        const check = (): boolean => {
          const found = frames.find(predicate)
          if (!found) return false
          cleanup()
          resolve(found)
          return true
        }
        const cleanup = (): void => {
          listeners.delete(check as () => void)
          clearTimeout(timer)
        }
        const timer = setTimeout(() => {
          cleanup()
          reject(
            new Error(
              `кадр не пришёл за ${timeoutMs} мс; получены: ${frames
                .map((frame) => frame.event)
                .join(', ')}`,
            ),
          )
        }, timeoutMs)

        if (check()) return
        listeners.add(check as () => void)
      })
    },
  }
}

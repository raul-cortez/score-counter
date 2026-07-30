/**
 * Реестр открытых потоков.
 *
 * Знает только, кому отправить строку. Ни про игру, ни про базу, ни про Fastify
 * здесь ничего нет — что именно рассылать, решает вызывающий.
 */

export type Connection = {
  userId: string
  write: (chunk: string) => void
}

export type Registry = {
  add: (roomId: string, conn: Connection) => void
  remove: (roomId: string, conn: Connection) => void
  /** Без повторов: две вкладки одного человека — один онлайн. */
  onlineUserIds: (roomId: string) => string[]
  isOnline: (roomId: string, userId: string) => boolean
  broadcast: (roomId: string, chunk: string) => void
  connectionCount: (roomId: string) => number
  closeAll: () => void
}

export type RegistryHooks = {
  /** Вызывается после того, как состав онлайна изменился. */
  onPresenceChange?: (roomId: string) => void
}

export function createRegistry(hooks: RegistryHooks = {}): Registry {
  const rooms = new Map<string, Set<Connection>>()

  function connections(roomId: string): Set<Connection> {
    return rooms.get(roomId) ?? new Set()
  }

  function add(roomId: string, conn: Connection): void {
    const existing = rooms.get(roomId)
    if (existing) {
      existing.add(conn)
    } else {
      rooms.set(roomId, new Set([conn]))
    }
    hooks.onPresenceChange?.(roomId)
  }

  function remove(roomId: string, conn: Connection): void {
    const set = rooms.get(roomId)
    if (!set?.delete(conn)) return

    if (set.size === 0) rooms.delete(roomId)
    hooks.onPresenceChange?.(roomId)
  }

  return {
    add,
    remove,

    onlineUserIds(roomId) {
      return [...new Set([...connections(roomId)].map((conn) => conn.userId))]
    },

    isOnline(roomId, userId) {
      return [...connections(roomId)].some((conn) => conn.userId === userId)
    },

    /**
     * Сокет мог закрыться между проверкой и записью — упавшее соединение
     * выбрасывается, чтобы одна мёртвая вкладка не роняла рассылку остальным.
     */
    broadcast(roomId, chunk) {
      for (const conn of [...connections(roomId)]) {
        try {
          conn.write(chunk)
        } catch {
          remove(roomId, conn)
        }
      }
    },

    connectionCount(roomId) {
      return connections(roomId).size
    },

    closeAll() {
      rooms.clear()
    },
  }
}

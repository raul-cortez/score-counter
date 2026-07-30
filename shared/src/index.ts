export type GameStatus = 'active' | 'finished' | 'abandoned'

export type PublicUser = {
  id: string
  nickname: string
  hasEmail: boolean
}

/** Себя видно подробнее: клиенту нужно знать, куда вернуться после перезагрузки. */
export type CurrentUser = PublicUser & {
  activeRoomCode: string | null
}

export type ScoreEntry = {
  seq: number
  id: string
  gameId: string
  userId: string
  points: number
  createdBy: string
  createdAt: number
  voidedAt: number | null
  voidedBy: string | null
}

export type RoomSummary = {
  id: string
  code: string
  name: string
  hasPassword: boolean
  hostUserId: string
  memberCount: number
  gameActive: boolean
}

export type RoomInfo = {
  id: string
  code: string
  name: string
  hasPassword: boolean
  hostUserId: string
}

export type GameDetails = {
  id: string
  scoreLimit: number
  status: GameStatus
  startedAt: number
  finishedAt: number | null
  winnerUserId: string | null
  players: PublicUser[]
  entries: ScoreEntry[]
  scores: Record<string, number>
}

/** Всё, что нужно, чтобы отрисовать экран комнаты целиком. */
export type RoomState = {
  room: RoomInfo
  members: PublicUser[]
  /** Кто сейчас держит открытый поток. Живёт в памяти процесса, не в базе. */
  online: string[]
  game: GameDetails | null
}

/** Типы записей журнала комнаты. `presence` сюда не входит: он не переживает рестарт. */
export type RoomEventType =
  | 'member_joined'
  | 'member_left'
  | 'host_changed'
  | 'game_started'
  | 'game_finished'
  | 'entry_added'
  | 'entry_voided'

export type RoomEvent = {
  seq: number
  type: RoomEventType
  payload: unknown
  createdAt: number
}

/**
 * Кадры, которые сервер шлёт в поток.
 *
 * Состояние всегда приезжает снимком целиком — клиент его заменяет, а не собирает
 * из дельт. `payload` нужен только для уведомлений вида «Петя отменил запись».
 */
export type ServerFrame =
  | { type: 'sync'; seq: number; state: RoomState }
  | { type: 'missed'; events: RoomEvent[] }
  | { type: 'presence'; state: RoomState }
  | { type: RoomEventType; seq: number; payload: unknown; state: RoomState }

export type Game = {
  id: string
  roomId: string
  scoreLimit: number
  status: GameStatus
  startedAt: number
  finishedAt: number | null
  winnerUserId: string | null
}

/** Строка в списке «мои игры»: всё, что нужно нарисовать её, без второго запроса. */
export type GameHistoryItem = {
  id: string
  roomName: string
  roomCode: string
  scoreLimit: number
  status: GameStatus
  startedAt: number
  finishedAt: number | null
  winnerUserId: string | null
  myScore: number
  players: PublicUser[]
}

/** Разбор одной партии для экрана истории: имена и раздачи, без второго запроса. */
export type GameHistoryDetails = {
  id: string
  roomName: string
  roomCode: string
  scoreLimit: number
  status: GameStatus
  startedAt: number
  finishedAt: number | null
  winnerUserId: string | null
  players: PublicUser[]
  entries: ScoreEntry[]
  scores: Record<string, number>
}

export type OpponentStat = {
  user: PublicUser
  /** Сколько доигранных партий вместе. */
  games: number
  /** Сколько из них выиграл он. */
  theirWins: number
}

/** Брошенные партии в сводку не идут: они ничего не говорят о победах. */
export type MyStats = {
  gamesPlayed: number
  wins: number
  bestScore: number
  opponents: OpponentStat[]
}

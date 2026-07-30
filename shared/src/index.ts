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
  game: GameDetails | null
}

export type Game = {
  id: string
  roomId: string
  scoreLimit: number
  status: GameStatus
  startedAt: number
  finishedAt: number | null
  winnerUserId: string | null
}

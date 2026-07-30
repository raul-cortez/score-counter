export type GameStatus = 'active' | 'finished' | 'abandoned'

export type PublicUser = {
  id: string
  nickname: string
  hasEmail: boolean
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
  memberCount: number
  gameActive: boolean
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

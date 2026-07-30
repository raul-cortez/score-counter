export type Player = {
  id: number
  name: string
  score: number
}

export type GameState = {
  players: Player[]
  scoreLimit: number
  gameStarted: boolean
}

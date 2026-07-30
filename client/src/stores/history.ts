import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { GameHistoryDetails, GameHistoryItem, MyStats } from '@score/shared'
import { api } from '../api.js'

export const useHistoryStore = defineStore('history', () => {
  const games = ref<GameHistoryItem[]>([])
  const stats = ref<MyStats | null>(null)
  const loading = ref(false)

  async function load(): Promise<void> {
    loading.value = true
    try {
      // Список и сводка независимы — незачем ждать их по очереди.
      const [loadedGames, loadedStats] = await Promise.all([
        api.get<GameHistoryItem[]>('/me/games'),
        api.get<MyStats>('/me/stats'),
      ])
      games.value = loadedGames
      stats.value = loadedStats
    } finally {
      loading.value = false
    }
  }

  function loadGame(gameId: string): Promise<GameHistoryDetails> {
    return api.get<GameHistoryDetails>(`/games/${gameId}`)
  }

  return { games, stats, loading, load, loadGame }
})

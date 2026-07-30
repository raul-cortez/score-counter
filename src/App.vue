<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import type { Player, GameState } from './types'
import SetupScreen from './components/SetupScreen.vue'
import GameScreen from './components/GameScreen.vue'
import VictoryScreen from './components/VictoryScreen.vue'

const STORAGE_KEY = 'score-counter-game'

const players = ref<Player[]>([])
const scoreLimit = ref(100)
const gameStarted = ref(false)
const isDark = ref(false)

const winner = computed(() => {
  if (!gameStarted.value || scoreLimit.value <= 0) return null
  return players.value.find(p => p.score >= scoreLimit.value) || null
})

const saveGame = () => {
  const state: GameState = {
    players: players.value,
    scoreLimit: scoreLimit.value,
    gameStarted: gameStarted.value
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

const loadGame = () => {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved) {
    try {
      const state: GameState = JSON.parse(saved)
      players.value = state.players
      scoreLimit.value = state.scoreLimit
      gameStarted.value = state.gameStarted
    } catch (e) {
      console.error('Failed to load game state')
    }
  }
}

const clearGame = () => {
  localStorage.removeItem(STORAGE_KEY)
}

const startGame = (newPlayers: Player[], limit: number) => {
  clearGame()
  players.value = newPlayers
  scoreLimit.value = limit
  gameStarted.value = true
  saveGame()
}

const resetScores = () => {
  players.value.forEach(p => p.score = 0)
  saveGame()
}

const addScore = (playerId: number, points: number) => {
  const player = players.value.find(p => p.id === playerId)
  if (player) {
    player.score += points
    saveGame()
  }
}

const newGame = () => {
  clearGame()
  players.value = []
  gameStarted.value = false
}

const toggleTheme = () => {
  isDark.value = !isDark.value
  document.documentElement.setAttribute('data-theme', isDark.value ? 'dark' : 'light')
  localStorage.setItem('score-counter-theme', isDark.value ? 'dark' : 'light')
}

onMounted(() => {
  const savedTheme = localStorage.getItem('score-counter-theme')
  if (savedTheme === 'dark') {
    isDark.value = true
    document.documentElement.setAttribute('data-theme', 'dark')
  }
  loadGame()
})
</script>

<template>
  <div class="app-root">
    <button class="theme-toggle" @click="toggleTheme">
      {{ isDark ? '☀️' : '🌙' }}
    </button>

    <VictoryScreen
      v-if="winner"
      :winner="winner"
      @new-game="newGame"
    />
    <SetupScreen
      v-else-if="!gameStarted"
      @start="startGame"
    />
    <GameScreen
      v-else
      :players="players"
      :score-limit="scoreLimit"
      @add-score="addScore"
      @reset="resetScores"
      @new-game="newGame"
    />
  </div>
</template>

<style scoped lang="scss">
.app-root {
  min-height: 100vh;
  min-height: 100dvh;
  padding: 20px;
  display: flex;
  flex-direction: column;
  position: relative;
}

.theme-toggle {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 44px;
  height: 44px;
  border: 2px solid var(--border);
  border-radius: 50%;
  background: var(--bg-card);
  font-size: 20px;
  cursor: pointer;
  transition: all 0.15s;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;

  &:hover {
    border-color: var(--border-hover);
  }
}
</style>

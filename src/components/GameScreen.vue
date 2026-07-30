<script setup lang="ts">
import { ref, nextTick } from 'vue'
import type { Player } from '../types'
import PlayerCard from './PlayerCard.vue'

defineProps<{
  players: Player[]
  scoreLimit: number
}>()

const emit = defineEmits<{
  addScore: [playerId: number, points: number]
  reset: []
  newGame: []
}>()

const selectedPlayerId = ref<number | null>(null)
const pointsInput = ref('')
const inputRef = ref<HTMLInputElement | null>(null)

const selectPlayer = async (playerId: number) => {
  if (selectedPlayerId.value === playerId) {
    selectedPlayerId.value = null
  } else {
    selectedPlayerId.value = playerId
    pointsInput.value = ''
    await nextTick()
    inputRef.value?.focus()
  }
}

const addPoints = () => {
  const points = parseInt(pointsInput.value)
  if (selectedPlayerId.value !== null && !isNaN(points) && points > 0) {
    emit('addScore', selectedPlayerId.value, points)
    pointsInput.value = ''
    selectedPlayerId.value = null
  }
}

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Enter') {
    addPoints()
  }
}
</script>

<template>
  <div class="game-root">
    <div class="header">
      <span class="limit-info">Играем до {{ scoreLimit }}</span>
    </div>

    <div class="cards">
      <PlayerCard
        v-for="player in players"
        :key="player.id"
        :player="player"
        :score-limit="scoreLimit"
        :selected="selectedPlayerId === player.id"
        @select="selectPlayer(player.id)"
      />
    </div>

    <div class="controls" v-if="selectedPlayerId !== null">
      <input
        ref="inputRef"
        v-model="pointsInput"
        type="number"
        class="points-input"
        placeholder="Очки"
        min="1"
        @keydown="handleKeydown"
      />
      <button class="btn-add" @click="addPoints" :disabled="!pointsInput">
        Добавить
      </button>
    </div>

    <div class="actions">
      <button class="btn-reset" @click="emit('reset')">
        Сбросить очки
      </button>
      <button class="btn-new" @click="emit('newGame')">
        Новая игра
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.game-root {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 24px;
  max-width: 800px;
  margin: 0 auto;
  width: 100%;
}

.header {
  text-align: center;
}

.limit-info {
  font-size: 16px;
  color: var(--text-muted);
}

.cards {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;

  @media (min-width: 600px) {
    grid-template-columns: repeat(3, 1fr);
  }

  @media (min-width: 900px) {
    grid-template-columns: repeat(4, 1fr);
  }
}

.controls {
  display: flex;
  gap: 12px;
  position: sticky;
  bottom: 20px;
  background: var(--bg-card);
  padding: 16px;
  border-radius: 12px;
  box-shadow: 0 4px 20px var(--shadow);
}

.points-input {
  flex: 1;
  padding: 12px 16px;
  border: 2px solid var(--border);
  border-radius: 8px;
  font-size: 18px;
  text-align: center;
  background: var(--bg-card);
  color: var(--text);

  &:focus {
    outline: none;
    border-color: var(--btn-bg);
  }

  &::-webkit-outer-spin-button,
  &::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
}

.btn-add {
  padding: 12px 24px;
  background: var(--btn-bg);
  color: var(--btn-text);
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;

  &:hover:not(:disabled) {
    background: var(--btn-hover);
  }

  &:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
}

.actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  flex-wrap: wrap;
}

.btn-reset,
.btn-new {
  padding: 12px 24px;
  background: transparent;
  color: var(--text-hint);
  border: 2px solid var(--border);
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    border-color: var(--border-hover);
    color: var(--text-muted);
  }
}
</style>

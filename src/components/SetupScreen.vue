<script setup lang="ts">
import { ref, computed } from 'vue'
import type { Player } from '../types'

const emit = defineEmits<{
  start: [players: Player[], scoreLimit: number]
}>()

const playerCount = ref(2)
const playerNames = ref<string[]>(['', ''])
const scoreLimit = ref(100)

const updatePlayerCount = (delta: number) => {
  const newCount = playerCount.value + delta
  if (newCount >= 2 && newCount <= 10) {
    playerCount.value = newCount
    while (playerNames.value.length < newCount) {
      playerNames.value.push('')
    }
    while (playerNames.value.length > newCount) {
      playerNames.value.pop()
    }
  }
}

const canStart = computed(() => playerCount.value >= 2 && scoreLimit.value > 0)

const startGame = () => {
  const players: Player[] = playerNames.value.map((name, index) => ({
    id: index + 1,
    name: name.trim() || `Игрок ${index + 1}`,
    score: 0
  }))
  emit('start', players, scoreLimit.value)
}
</script>

<template>
  <div class="setup-root">
    <h1 class="title">Счётчик очков</h1>

    <div class="counter">
      <span class="label">Игроков:</span>
      <button class="btn-count" @click="updatePlayerCount(-1)" :disabled="playerCount <= 2">−</button>
      <span class="count">{{ playerCount }}</span>
      <button class="btn-count" @click="updatePlayerCount(1)" :disabled="playerCount >= 10">+</button>
    </div>

    <div class="limit-row">
      <span class="label">До скольки очков:</span>
      <input
        v-model.number="scoreLimit"
        type="number"
        class="limit-input"
        min="1"
        placeholder="100"
      />
    </div>

    <div class="names">
      <input
        v-for="(_, index) in playerNames"
        :key="index"
        v-model="playerNames[index]"
        type="text"
        class="name-input"
        :placeholder="`Игрок ${index + 1}`"
      />
    </div>

    <button class="btn-start" :disabled="!canStart" @click="startGame">
      Начать игру
    </button>
  </div>
</template>

<style scoped lang="scss">
.setup-root {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
  max-width: 400px;
  margin: 0 auto;
  width: 100%;
}

.title {
  font-size: 28px;
  font-weight: 700;
  margin: 0;
  text-align: center;
}

.counter {
  display: flex;
  align-items: center;
  gap: 16px;
}

.label {
  font-size: 18px;
}

.btn-count {
  width: 44px;
  height: 44px;
  border: 2px solid var(--btn-bg);
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--text);
  font-size: 24px;
  cursor: pointer;
  transition: all 0.15s;

  &:hover:not(:disabled) {
    background: var(--btn-bg);
    color: var(--btn-text);
  }

  &:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
}

.count {
  font-size: 32px;
  font-weight: 700;
  min-width: 40px;
  text-align: center;
}

.limit-row {
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
  justify-content: center;
}

.limit-input {
  width: 100px;
  padding: 12px 16px;
  border: 2px solid var(--border);
  border-radius: 8px;
  font-size: 18px;
  text-align: center;
  background: var(--bg-card);
  color: var(--text);
  transition: border-color 0.15s;

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

.names {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
}

.name-input {
  padding: 12px 16px;
  border: 2px solid var(--border);
  border-radius: 8px;
  font-size: 16px;
  background: var(--bg-card);
  color: var(--text);
  transition: border-color 0.15s;

  &::placeholder {
    color: var(--text-hint);
  }

  &:focus {
    outline: none;
    border-color: var(--btn-bg);
  }
}

.btn-start {
  padding: 16px 32px;
  background: var(--btn-bg);
  color: var(--btn-text);
  border: none;
  border-radius: 8px;
  font-size: 18px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  margin-top: auto;

  &:hover:not(:disabled) {
    background: var(--btn-hover);
  }

  &:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
}
</style>

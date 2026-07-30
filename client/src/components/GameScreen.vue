<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import type { GameDetails, RoomState } from '@score/shared'
import PlayerCard from './PlayerCard.vue'

const props = defineProps<{
  state: RoomState
  game: GameDetails
  meId: string
  busy: boolean
}>()

const emit = defineEmits<{ addPoints: [userId: string, points: number] }>()

const selectedId = ref<string | null>(null)
const pointsInput = ref('')
const inputRef = ref<HTMLInputElement | null>(null)

const isHost = computed(() => props.meId === props.state.room.hostUserId)

/** Себе — всегда, другому — только хост. Те же правила, что и на сервере. */
function mayWriteFor(userId: string): boolean {
  if (!props.game.players.some((player) => player.id === props.meId)) return false
  return userId === props.meId || isHost.value
}

const selectedName = computed(
  () => props.game.players.find((player) => player.id === selectedId.value)?.nickname ?? '',
)

async function select(userId: string): Promise<void> {
  if (!mayWriteFor(userId)) return

  if (selectedId.value === userId) {
    selectedId.value = null
    return
  }
  selectedId.value = userId
  pointsInput.value = ''
  await nextTick()
  inputRef.value?.focus()
}

function submit(): void {
  const points = Number.parseInt(pointsInput.value, 10)
  if (selectedId.value === null || Number.isNaN(points) || points < 1 || props.busy) return

  emit('addPoints', selectedId.value, points)
  pointsInput.value = ''
  selectedId.value = null
}
</script>

<template>
  <div class="game-root">
    <div class="header">
      <span class="limit-info">Играем до {{ game.scoreLimit }}</span>
    </div>

    <div class="cards">
      <PlayerCard
        v-for="player in game.players"
        :key="player.id"
        :player="player"
        :score="game.scores[player.id] ?? 0"
        :score-limit="game.scoreLimit"
        :selected="selectedId === player.id"
        :online="state.online.includes(player.id)"
        :is-you="player.id === meId"
        :is-host="player.id === state.room.hostUserId"
        @select="select(player.id)"
      />
    </div>

    <div v-if="selectedId !== null" class="controls">
      <span class="for-whom">{{ selectedName }}</span>
      <input
        ref="inputRef"
        v-model="pointsInput"
        type="number"
        class="points-input"
        placeholder="Очки"
        min="1"
        @keydown.enter="submit"
      />
      <button class="btn-add" :disabled="!pointsInput || busy" @click="submit">Добавить</button>
    </div>
    <p v-else class="pick-hint">
      {{ isHost ? 'Нажмите на игрока, чтобы записать очки' : 'Нажмите на себя, чтобы записать очки' }}
    </p>
  </div>
</template>

<style scoped lang="scss">
.game-root {
  display: flex;
  flex-direction: column;
  gap: 16px;
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
  align-items: center;
  gap: 12px;
  position: sticky;
  bottom: 20px;
  background: var(--bg-card);
  padding: 16px;
  border-radius: 12px;
  box-shadow: 0 4px 20px var(--shadow);
  z-index: 10;
}

.for-whom {
  font-weight: 600;
  white-space: nowrap;
}

.points-input {
  flex: 1;
  min-width: 0;
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
  white-space: nowrap;

  &:hover:not(:disabled) {
    background: var(--btn-hover);
  }

  &:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
}

.pick-hint {
  text-align: center;
  color: var(--text-hint);
  font-size: 14px;
}
</style>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { GameDetails, RoomState } from '@score/shared'

const props = defineProps<{
  state: RoomState
  game: GameDetails
  meId: string
  busy: boolean
}>()

const emit = defineEmits<{ playAgain: [scoreLimit: number]; leave: [] }>()

const scoreLimit = ref(props.game.scoreLimit)

const isHost = computed(() => props.meId === props.state.room.hostUserId)
const winner = computed(() =>
  props.game.players.find((player) => player.id === props.game.winnerUserId),
)

/** Итоговая таблица: сверху победитель, дальше по убыванию очков. */
const standings = computed(() =>
  [...props.game.players].sort(
    (a, b) => (props.game.scores[b.id] ?? 0) - (props.game.scores[a.id] ?? 0),
  ),
)
</script>

<template>
  <div class="victory-root">
    <div class="content">
      <h1 class="title">{{ winner?.nickname ?? 'Ничья' }}</h1>
      <p class="subtitle">{{ winner?.id === meId ? 'вы победили!' : 'победил' }}</p>

      <ul class="standings">
        <li v-for="(player, index) in standings" :key="player.id" class="place">
          <span class="rank">{{ index + 1 }}</span>
          <span class="nick">
            {{ player.nickname }}
            <span v-if="player.id === meId" class="you">вы</span>
          </span>
          <span class="place-score">{{ game.scores[player.id] ?? 0 }}</span>
        </li>
      </ul>

      <template v-if="isHost">
        <label class="limit">
          <span>Следующая до</span>
          <input v-model.number="scoreLimit" class="limit-input" type="number" min="1" max="10000" />
        </label>
        <button
          class="btn-new"
          :disabled="scoreLimit < 1 || busy"
          @click="emit('playAgain', scoreLimit)"
        >
          Играть ещё
        </button>
      </template>
      <p v-else class="hint">Хост может начать новую игру тем же составом.</p>

      <button class="btn-quiet" @click="emit('leave')">Выйти из комнаты</button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.victory-root {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  text-align: center;
  max-width: 460px;
  width: 100%;
}

.title {
  font-size: 36px;
  font-weight: 700;
  word-break: break-word;

  @media (min-width: 600px) {
    font-size: 48px;
  }
}

.subtitle {
  font-size: 20px;
  color: var(--text-muted);
  margin-bottom: 8px;
}

.standings {
  list-style: none;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.place {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--bg-card);
  border: 2px solid var(--border);
  border-radius: 8px;
  text-align: left;

  &:first-child {
    border-color: var(--btn-bg);
  }
}

.rank {
  color: var(--text-hint);
  font-variant-numeric: tabular-nums;
  width: 18px;
}

.nick {
  flex: 1;
  min-width: 0;
}

.you {
  font-size: 11px;
  text-transform: uppercase;
  color: var(--text-hint);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 1px 4px;
  margin-left: 4px;
}

.place-score {
  font-size: 20px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.limit {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  color: var(--text-muted);
  margin-top: 8px;
}

.limit-input {
  width: 120px;
  padding: 10px 12px;
  border: 2px solid var(--border);
  border-radius: 8px;
  font-size: 17px;
  text-align: center;
  background: var(--bg-card);
  color: var(--text);

  &:focus {
    outline: none;
    border-color: var(--btn-bg);
  }
}

.btn-new {
  width: 100%;
  padding: 16px 32px;
  background: var(--btn-bg);
  color: var(--btn-text);
  border: none;
  border-radius: 8px;
  font-size: 18px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;

  &:hover:not(:disabled) {
    background: var(--btn-hover);
  }

  &:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
}

.btn-quiet {
  padding: 12px 20px;
  background: transparent;
  color: var(--text-hint);
  border: 2px solid var(--border);
  border-radius: 8px;
  cursor: pointer;

  &:hover {
    border-color: var(--border-hover);
  }
}

.hint {
  color: var(--text-hint);
  font-size: 14px;
}
</style>

<script setup lang="ts">
import { ref } from 'vue'
import type { RoomState } from '@score/shared'

const props = defineProps<{
  state: RoomState
  meId: string
  /** Подставляется лимит прошлой игры: рестарт тем же лимитом — одно нажатие. */
  defaultLimit: number
  busy: boolean
}>()

const emit = defineEmits<{ start: [scoreLimit: number]; leave: [] }>()

const scoreLimit = ref(props.defaultLimit)
const copied = ref(false)

const MIN_PLAYERS = 2

async function copyInvite(): Promise<void> {
  await navigator.clipboard.writeText(`${location.origin}/room/${props.state.room.code}`)
  copied.value = true
  setTimeout(() => (copied.value = false), 2000)
}
</script>

<template>
  <div class="waiting-root">
    <h1 class="title">{{ state.room.name }}</h1>

    <button class="code" @click="copyInvite">
      {{ copied ? 'Ссылка скопирована' : `Код ${state.room.code} — скопировать ссылку` }}
    </button>

    <ul class="members">
      <li v-for="member in state.members" :key="member.id" class="member">
        <span class="dot" :class="{ on: state.online.includes(member.id) }" />
        <span class="nick">{{ member.nickname }}</span>
        <span v-if="member.id === state.room.hostUserId" title="Хост">👑</span>
        <span v-if="member.id === meId" class="you">вы</span>
      </li>
    </ul>

    <template v-if="meId === state.room.hostUserId">
      <label class="limit">
        <span>Играем до</span>
        <input v-model.number="scoreLimit" class="limit-input" type="number" min="1" max="10000" />
      </label>

      <button
        class="btn-primary"
        :disabled="state.members.length < MIN_PLAYERS || scoreLimit < 1 || busy"
        @click="emit('start', scoreLimit)"
      >
        Начать игру
      </button>
      <p v-if="state.members.length < MIN_PLAYERS" class="hint">
        Нужен хотя бы ещё один игрок — отправьте им ссылку.
      </p>
    </template>
    <p v-else class="hint">Ждём, пока хост начнёт игру.</p>

    <button class="btn-quiet" @click="emit('leave')">Выйти из комнаты</button>
  </div>
</template>

<style scoped lang="scss">
.waiting-root {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 500px;
  margin: 0 auto;
  width: 100%;
}

.title {
  font-size: 26px;
  font-weight: 700;
  text-align: center;
  padding-right: 56px;
}

.code {
  padding: 12px 16px;
  border: 2px dashed var(--border);
  border-radius: 8px;
  background: transparent;
  color: var(--text-muted);
  font-size: 15px;
  cursor: pointer;

  &:hover {
    border-color: var(--border-hover);
  }
}

.members {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.member {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  background: var(--bg-card);
  border: 2px solid var(--border);
  border-radius: 8px;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--border);
  flex-shrink: 0;

  &.on {
    background: #4caf50;
  }
}

.nick {
  flex: 1;
}

.you {
  font-size: 11px;
  text-transform: uppercase;
  color: var(--text-hint);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 1px 4px;
}

.limit {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--text-muted);
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

.btn-primary {
  padding: 14px 24px;
  background: var(--btn-bg);
  color: var(--btn-text);
  border: none;
  border-radius: 8px;
  font-size: 17px;
  font-weight: 600;
  cursor: pointer;

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
  text-align: center;
  color: var(--text-hint);
  font-size: 14px;
}
</style>

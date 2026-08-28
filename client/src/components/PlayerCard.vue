<script setup lang="ts">
import { computed } from 'vue'
import type { PublicUser } from '@score/shared'
import AppIcon from './AppIcon.vue'

const props = defineProps<{
  player: PublicUser
  score: number
  scoreLimit: number
  selected: boolean
  online: boolean
  isYou: boolean
  isHost: boolean
  canRemove: boolean
}>()

const emit = defineEmits<{ select: []; remove: [] }>()

function requestRemove(event: MouseEvent): void {
  event.stopPropagation()
  emit('remove')
}

const progress = computed(() => {
  if (props.scoreLimit <= 0) return 0
  return Math.min(100, Math.max(0, (props.score / props.scoreLimit) * 100))
})
</script>

<template>
  <div class="card-root" :class="{ selected, offline: !online }" @click="$emit('select')">
    <div class="progress-bar" :style="{ height: `${progress}%` }" />

    <span class="badges">
      <AppIcon v-if="isHost" class="badge" name="crown" :size="15" title="Хост" />
      <span class="dot" :class="{ on: online }" :title="online ? 'В сети' : 'Не в сети'" />
    </span>

    <button
      v-if="canRemove"
      class="remove-btn"
      type="button"
      title="Убрать из партии"
      @click="requestRemove"
    >
      <AppIcon name="close" :size="12" />
    </button>

    <span class="name">
      {{ player.nickname }}
      <span v-if="isYou" class="you">вы</span>
    </span>
    <span class="score">{{ score }}</span>
  </div>
</template>

<style scoped lang="scss">
.card-root {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 20px 16px;
  background: var(--bg-card);
  border: 3px solid var(--border);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.15s;
  user-select: none;
  position: relative;
  overflow: hidden;

  &:hover {
    border-color: var(--border-hover);
  }

  &.selected {
    border-color: var(--btn-bg);
  }

  &.offline {
    opacity: 0.6;
  }
}

.progress-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: var(--btn-bg);
  opacity: 0.1;
  transition: height 0.3s ease-out;
}

.badges {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--border);

  &.on {
    background: #4caf50;
  }
}

.name {
  font-size: 16px;
  font-weight: 500;
  color: var(--text-muted);
  text-align: center;
  word-break: break-word;
  position: relative;
}

.you {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-hint);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 1px 4px;
  margin-left: 4px;
}

.score {
  font-size: 48px;
  font-weight: 700;
  line-height: 1;
  position: relative;
}

.remove-btn {
  position: absolute;
  top: 8px;
  left: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--text-hint);
  cursor: pointer;

  &:hover {
    border-color: #e05252;
    color: #e05252;
  }
}
</style>

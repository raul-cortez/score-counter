<script setup lang="ts">
import { computed } from 'vue'
import type { Player } from '../types'

const props = defineProps<{
  player: Player
  scoreLimit: number
  selected: boolean
}>()

const emit = defineEmits<{
  select: []
}>()

const progress = computed(() => {
  if (props.scoreLimit <= 0) return 0
  return Math.min(100, (props.player.score / props.scoreLimit) * 100)
})
</script>

<template>
  <div
    class="card-root"
    :class="{ selected }"
    @click="emit('select')"
  >
    <div class="progress-bar" :style="{ height: `${progress}%` }" />
    <span class="name">{{ player.name }}</span>
    <span class="score">{{ player.score }}</span>
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

.name {
  font-size: 16px;
  font-weight: 500;
  color: var(--text-muted);
  text-align: center;
  word-break: break-word;
  position: relative;
}

.score {
  font-size: 48px;
  font-weight: 700;
  line-height: 1;
  position: relative;
}
</style>

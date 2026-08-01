<script setup lang="ts">
import type { ConnectionStatus } from '../realtime.js'

defineProps<{ status: ConnectionStatus }>()
</script>

<template>
  <div v-if="status !== 'live'" class="banner" :class="status">
    {{ status === 'connecting' ? 'Подключаемся…' : 'Нет связи — пробуем переподключиться' }}
  </div>
</template>

<style scoped lang="scss">
.banner {
  padding: 10px 16px;
  border-radius: 8px;
  text-align: center;
  font-size: 14px;
  background: var(--bg-card);
  border: 2px solid var(--border);
  color: var(--text-muted);

  &.offline {
    border-color: #e0a052;
  }
}
</style>

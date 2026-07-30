<script setup lang="ts">
import { onMounted } from 'vue'
import { useTheme } from './composables/useTheme.js'

const { isDark, toggleTheme, restoreTheme } = useTheme()

onMounted(restoreTheme)
</script>

<template>
  <div class="app-root">
    <button class="theme-toggle" :title="isDark ? 'Светлая тема' : 'Тёмная тема'" @click="toggleTheme">
      {{ isDark ? '☀️' : '🌙' }}
    </button>

    <RouterView />
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

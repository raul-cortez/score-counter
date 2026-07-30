<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSessionStore } from '../stores/session.js'
import { describeError } from '../api.js'

const session = useSessionStore()
const route = useRoute()
const router = useRouter()

const nickname = ref('')
const busy = ref(false)
const error = ref('')

async function enter(): Promise<void> {
  const name = nickname.value.trim()
  if (name === '' || busy.value) return

  busy.value = true
  error.value = ''
  try {
    await session.loginAsGuest(name)
    // Возвращаем туда, куда человек шёл: ссылка-приглашение не должна теряться.
    const next = route.query.next
    await router.replace(typeof next === 'string' ? next : '/')
  } catch (err) {
    error.value = describeError(err)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="hello-root">
    <h1 class="title">Счётчик очков</h1>
    <p class="hint">Как вас записать?</p>

    <input
      v-model="nickname"
      class="name-input"
      type="text"
      maxlength="20"
      placeholder="Имя"
      autofocus
      @keydown.enter="enter"
    />

    <button class="btn-primary" :disabled="nickname.trim() === '' || busy" @click="enter">
      {{ busy ? 'Заходим…' : 'Играть' }}
    </button>

    <p v-if="error" class="error">{{ error }}</p>
    <p class="note">Имя можно поменять позже, а историю — привязать к почте.</p>
  </div>
</template>

<style scoped lang="scss">
.hello-root {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  max-width: 400px;
  margin: 0 auto;
  width: 100%;
}

.title {
  font-size: 32px;
  font-weight: 700;
  text-align: center;
}

.hint {
  color: var(--text-muted);
}

.name-input {
  width: 100%;
  padding: 14px 16px;
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
}

.btn-primary {
  width: 100%;
  padding: 14px 24px;
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

.error {
  color: #e05252;
  font-size: 14px;
  text-align: center;
}

.note {
  color: var(--text-hint);
  font-size: 13px;
  text-align: center;
}
</style>

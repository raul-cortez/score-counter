<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { useSessionStore } from '../stores/session.js'
import { describeError } from '../api.js'

/**
 * Смена имени.
 *
 * Имя показывается там же, где меняется: отдельного экрана настроек в приложении нет
 * и заводить его ради одного поля незачем. За столом имя правят на ходу — когда
 * выяснилось, что за ним двое Саш, — поэтому редактор живёт и в лобби, и в комнате.
 */
const session = useSessionStore()

const editing = ref(false)
const draft = ref('')
const busy = ref(false)
const error = ref('')
const inputRef = ref<HTMLInputElement | null>(null)

async function start(): Promise<void> {
  draft.value = session.user?.nickname ?? ''
  editing.value = true
  error.value = ''
  await nextTick()
  inputRef.value?.focus()
  inputRef.value?.select()
}

function cancel(): void {
  editing.value = false
  error.value = ''
}

async function save(): Promise<void> {
  const next = draft.value.trim()
  if (next === '' || busy.value) return
  // Ничего не менялось — незачем дёргать сервер и объявлять комнате о смене.
  if (next === session.user?.nickname) {
    cancel()
    return
  }

  busy.value = true
  error.value = ''
  try {
    await session.rename(next)
    editing.value = false
  } catch (err) {
    error.value = describeError(err)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <span class="nickname-root">
    <template v-if="editing">
      <input
        ref="inputRef"
        v-model="draft"
        class="name-field"
        type="text"
        maxlength="20"
        placeholder="Имя"
        @keydown.enter="save"
        @keydown.esc="cancel"
      />
      <button class="btn-tiny" :disabled="draft.trim() === '' || busy" @click="save">
        {{ busy ? '…' : 'Готово' }}
      </button>
      <button class="btn-tiny" @click="cancel">Отмена</button>
      <span v-if="error" class="name-error">{{ error }}</span>
    </template>

    <button v-else class="current" title="Сменить имя" @click="start">
      {{ session.user?.nickname }}
    </button>
  </span>
</template>

<style scoped lang="scss">
.nickname-root {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.current {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 6px;
  background: none;
  border: 1px solid transparent;
  border-radius: 6px;
  color: inherit;
  font: inherit;
  cursor: pointer;

  &:hover {
    border-color: var(--border);
  }
}

.name-field {
  width: 140px;
  padding: 4px 8px;
  border: 2px solid var(--border);
  border-radius: 6px;
  background: var(--bg-card);
  color: var(--text);
  font-size: 14px;

  &:focus {
    outline: none;
    border-color: var(--btn-bg);
  }
}

.btn-tiny {
  padding: 4px 8px;
  font-size: 13px;
  background: none;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-muted);
  cursor: pointer;

  &:hover:not(:disabled) {
    border-color: var(--border-hover);
    color: var(--text);
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
}

.name-error {
  color: #e05252;
  font-size: 13px;
}
</style>

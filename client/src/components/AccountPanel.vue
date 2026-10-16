<script setup lang="ts">
import { nextTick, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useSessionStore } from '../stores/session.js'
import { describeError } from '../api.js'
import { loginProblem, normalizeLogin, passwordProblem } from '../credentials.js'
import AppIcon from './AppIcon.vue'

/**
 * Аккаунт: привязка логина и выход.
 *
 * Значок стоит в шапке рядом с именем — там же, где имя и меняется. Форма
 * раскрывается не в строку шапки, а всплывает под значком: поля в строке выдавили
 * бы имя на вторую строку и переключили бы всю шапку.
 *
 * Логин нужен ровно затем, чтобы человека узнавали после того, как браузер вычистил
 * и localStorage, и резервную куку, — и чтобы узнавали с другого телефона.
 */
const session = useSessionStore()
const router = useRouter()

const root = ref<HTMLElement | null>(null)
const open = ref(false)
const login = ref('')
const password = ref('')
const busy = ref(false)
const error = ref('')
const loginRef = ref<HTMLInputElement | null>(null)

async function start(): Promise<void> {
  open.value = true
  error.value = ''
  await nextTick()
  loginRef.value?.focus()
}

function close(): void {
  open.value = false
  login.value = ''
  password.value = ''
  error.value = ''
}

/**
 * Щелчок мимо закрывает. По кнопке-значку это не сработает: она внутри root, и
 * проверка на вхождение пропускает её раньше, чем дело дошло бы до `close`.
 */
function onDocumentClick(event: MouseEvent): void {
  if (root.value?.contains(event.target as Node) === true) return
  close()
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') close()
}

watch(open, (value) => {
  if (value) {
    document.addEventListener('click', onDocumentClick)
    document.addEventListener('keydown', onKeydown)
    return
  }
  document.removeEventListener('click', onDocumentClick)
  document.removeEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick)
  document.removeEventListener('keydown', onKeydown)
})

/**
 * Проверяем на месте, а не ждём ответа сервера: правило то же, зато отказ приходит
 * по-русски и мгновенно, без похода в сеть.
 */
async function attach(): Promise<void> {
  if (busy.value) return

  const problem = loginProblem(login.value) ?? passwordProblem(password.value)
  if (problem !== null) {
    error.value = problem
    return
  }

  busy.value = true
  error.value = ''
  try {
    await session.attachLogin(normalizeLogin(login.value), password.value)
    close()
  } catch (err) {
    error.value = describeError(err)
  } finally {
    busy.value = false
  }
}

async function signOut(): Promise<void> {
  if (busy.value) return

  busy.value = true
  try {
    await session.logout()
    // Убираемся на экран входа: иначе человек остался бы на экране комнаты, откуда
    // его вот-вот выставит маршрутизатор, и увидел бы мельком чужой интерфейс.
    await router.push('/hello')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <span v-if="session.user" ref="root" class="account-root">
    <button
      class="icon"
      type="button"
      :class="{ active: open }"
      :title="session.user.hasLogin ? 'Аккаунт' : 'Привязать логин'"
      :aria-label="session.user.hasLogin ? 'Аккаунт' : 'Привязать логин'"
      :aria-expanded="open"
      @click="open ? close() : start()"
    >
      <AppIcon name="person" :size="16" />
    </button>

    <div v-if="open" class="panel">
      <template v-if="session.user.hasLogin">
        <p class="lead">Вход по логину настроен</p>
        <button class="btn-wide" type="button" :disabled="busy" @click="signOut">
          <AppIcon name="exit" :size="15" />
          Выйти
        </button>
      </template>

      <!--
        Привязка предлагается один раз и навсегда: менять логин, не спросив текущий
        пароль, значило бы дать чужому телефону с открытой сессией забрать аккаунт.
        Поэтому для привязанного аккаунта здесь только выход.
      -->
      <template v-else>
        <p class="lead">Привяжите логин — и вас будут узнавать на любом телефоне.</p>
        <input
          ref="loginRef"
          v-model="login"
          class="field"
          type="text"
          placeholder="Логин"
          autocapitalize="none"
          autocomplete="username"
          @keydown.enter="attach"
        />
        <input
          v-model="password"
          class="field"
          type="password"
          placeholder="Пароль"
          autocomplete="new-password"
          @keydown.enter="attach"
        />
        <button class="btn-wide" type="button" :disabled="busy" @click="attach">
          <AppIcon name="check" :size="15" />
          Привязать
        </button>
      </template>

      <p v-if="error" class="error">{{ error }}</p>
    </div>
  </span>
</template>

<style scoped lang="scss">
.account-root {
  position: relative;
  display: inline-flex;
  align-items: center;
}

/* Размером и рамкой повторяет переключатель темы: стоят рядом в одной строке. */
.icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 2px solid var(--border);
  border-radius: 999px;
  background: var(--bg-card);
  color: var(--text-muted);
  cursor: pointer;
  transition:
    border-color 0.2s ease,
    color 0.2s ease;

  &:hover,
  &.active {
    border-color: var(--border-hover);
    color: var(--text);
  }

  &:focus-visible {
    outline: 2px solid var(--btn-bg);
    outline-offset: 3px;
  }
}

/*
 * Всплывает под значком и висит поверх содержимого: в строке шапки форма выдавила
 * бы имя и переключила всю разметку. Ширина ограничена экраном, а не только
 * желаемой: с длинным именем значок уезжает вправо, и панель упёрлась бы в край.
 */
.panel {
  position: absolute;
  top: calc(100% + 10px);
  left: 0;
  z-index: 10;
  width: 240px;
  max-width: calc(100vw - 40px);
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: 0 8px 24px var(--shadow);
  text-align: left;
}

.lead {
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.35;
}

.field {
  width: 100%;
  padding: 8px 10px;
  border: 2px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
  color: var(--text);
  font-size: 15px;

  &:focus {
    outline: none;
    border-color: var(--btn-bg);
  }
}

.btn-wide {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  padding: 9px 12px;
  background: var(--bg);
  border: 2px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  font-size: 15px;
  cursor: pointer;

  &:hover:not(:disabled) {
    border-color: var(--border-hover);
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
}

.error {
  color: #e05252;
  font-size: 13px;
}
</style>

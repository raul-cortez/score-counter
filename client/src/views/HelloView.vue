<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSessionStore } from '../stores/session.js'
import { describeError } from '../api.js'
import { loginProblem, normalizeLogin, passwordProblem } from '../credentials.js'

const session = useSessionStore()
const route = useRoute()
const router = useRouter()

/**
 * Два входа на одном экране.
 *
 * По умолчанию — имя, как было: впервые пришедшему по ссылке от друга заводить
 * аккаунт незачем, а вход по логину нужен тем, кто уже здесь бывал и кого браузер
 * перестал узнавать. Поэтому он в одном нажатии, но не на виду.
 */
const withLogin = ref(false)

const nickname = ref('')
const login = ref('')
const password = ref('')
const busy = ref(false)
const error = ref('')

const firstField = ref<HTMLInputElement | null>(null)

async function switchTo(value: boolean): Promise<void> {
  if (busy.value) return
  withLogin.value = value
  error.value = ''
  if (value) password.value = ''
  await nextTick()
  firstField.value?.focus()
}

/** Возвращаем туда, куда человек шёл: ссылка-приглашение не должна теряться. */
async function go(): Promise<void> {
  const next = route.query.next
  await router.replace(typeof next === 'string' ? next : '/')
}

async function guard(action: () => Promise<void>): Promise<void> {
  busy.value = true
  error.value = ''
  try {
    await action()
    await go()
  } catch (err) {
    error.value = describeError(err)
  } finally {
    busy.value = false
  }
}

async function enterAsGuest(): Promise<void> {
  const name = nickname.value.trim()
  if (name === '' || busy.value) return
  await guard(() => session.loginAsGuest(name))
}

async function enterWithPassword(): Promise<void> {
  if (busy.value) return

  const problem = loginProblem(login.value) ?? passwordProblem(password.value)
  if (problem !== null) {
    error.value = problem
    return
  }

  await guard(() => session.loginWithPassword(normalizeLogin(login.value), password.value))
}
</script>

<template>
  <div class="hello-root">
    <h1 class="title">Счётчик очков</h1>

    <template v-if="withLogin">
      <p class="hint">Вход по логину</p>

      <input
        ref="firstField"
        v-model="login"
        class="name-input"
        type="text"
        placeholder="Логин"
        autocapitalize="none"
        autocomplete="username"
        @keydown.enter="enterWithPassword"
      />
      <input
        v-model="password"
        class="name-input"
        type="password"
        placeholder="Пароль"
        autocomplete="current-password"
        @keydown.enter="enterWithPassword"
      />

      <button class="btn-primary" :disabled="busy" @click="enterWithPassword">
        {{ busy ? 'Входим…' : 'Войти' }}
      </button>

      <button class="link" type="button" @click="switchTo(false)">Войти новым именем</button>
    </template>

    <template v-else>
      <p class="hint">Как вас записать?</p>

      <input
        ref="firstField"
        v-model="nickname"
        class="name-input"
        type="text"
        placeholder="Имя"
        autofocus
        @keydown.enter="enterAsGuest"
      />

      <button class="btn-primary" :disabled="nickname.trim() === '' || busy" @click="enterAsGuest">
        {{ busy ? 'Заходим…' : 'Играть' }}
      </button>

      <button class="link" type="button" @click="switchTo(true)">У меня уже есть логин</button>
    </template>

    <p v-if="error" class="error">{{ error }}</p>
    <p class="note">
      Логин привязывается после входа, значком человечка рядом с именем: с ним вас
      узнают и на другом телефоне.
    </p>
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

/*
 * Переход между двумя входами — не главное действие экрана, поэтому подпись, а не
 * кнопка: две одинаковые по весу кнопки заставляли бы выбирать между ними всерьёз.
 */
.link {
  padding: 4px 8px;
  background: none;
  border: none;
  color: var(--btn-bg);
  font-size: 15px;
  cursor: pointer;
  text-decoration: underline;

  &:disabled {
    opacity: 0.4;
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

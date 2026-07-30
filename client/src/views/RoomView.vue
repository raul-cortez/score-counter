<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ApiError, api, describeError } from '../api.js'
import { useRoomStore } from '../stores/room.js'
import { useSessionStore } from '../stores/session.js'
import ConnectionBanner from '../components/ConnectionBanner.vue'
import EntriesLog from '../components/EntriesLog.vue'
import GameScreen from '../components/GameScreen.vue'
import VictoryScreen from '../components/VictoryScreen.vue'
import WaitingRoom from '../components/WaitingRoom.vue'
import type { RoomSummary } from '@score/shared'

const room = useRoomStore()
const session = useSessionStore()
const route = useRoute()
const router = useRouter()

const code = String(route.params.code).toUpperCase()

const loading = ref(true)
const busy = ref(false)
const error = ref('')
/** Показывается, когда комната под паролем, а нас в ней ещё нет. */
const needPassword = ref(false)
const password = ref('')

const meId = computed(() => session.user?.id ?? '')
const game = computed(() => room.state?.game ?? null)

/** Экран победы держится, пока не начали следующую игру: он и есть итог партии. */
const showVictory = computed(() => game.value?.status === 'finished')
const showBoard = computed(() => game.value !== null && game.value.status === 'active')

/** Рестарт предлагается с лимитом прошлой игры — обычно он же и нужен. */
const defaultLimit = computed(() => game.value?.scoreLimit ?? 100)

async function guard<T>(action: () => Promise<T>): Promise<void> {
  busy.value = true
  error.value = ''
  try {
    await action()
  } catch (err) {
    error.value = describeError(err)
  } finally {
    busy.value = false
  }
}

async function enter(): Promise<void> {
  try {
    await room.load(code)
  } catch (err) {
    // 403 значит «комната есть, но мы не внутри» — пробуем войти.
    if (!(err instanceof ApiError) || err.status !== 403) throw err

    const summary = await api.get<RoomSummary>(`/rooms/${code}`)
    if (summary.hasPassword) {
      needPassword.value = true
      return
    }
    await room.join(code)
  }
  room.connect(code)
}

async function submitPassword(): Promise<void> {
  await guard(async () => {
    await room.join(code, password.value)
    needPassword.value = false
    password.value = ''
    room.connect(code)
  })
}

async function leave(): Promise<void> {
  await guard(async () => {
    await room.leave(code)
    room.reset()
    await session.refresh().catch(() => undefined)
    await router.push('/')
  })
}

onMounted(async () => {
  try {
    await enter()
  } catch (err) {
    error.value = describeError(err)
  } finally {
    loading.value = false
  }
})

// Поток обязан закрыться при уходе со страницы, иначе на сервере копятся
// соединения, а из-за них комната считает нас онлайн.
onUnmounted(() => room.disconnect())
</script>

<template>
  <div class="room-root">
    <p v-if="loading" class="center">Заходим в комнату…</p>

    <div v-else-if="needPassword" class="gate">
      <h1 class="gate-title">Комната под паролем</h1>
      <input
        v-model="password"
        class="field"
        type="password"
        placeholder="Пароль"
        autofocus
        @keydown.enter="submitPassword"
      />
      <button class="btn-primary" :disabled="busy" @click="submitPassword">Войти</button>
      <RouterLink class="back" to="/">Вернуться в лобби</RouterLink>
      <p v-if="error" class="error">{{ error }}</p>
    </div>

    <template v-else-if="room.state">
      <ConnectionBanner :status="room.status" />

      <ul v-if="room.notices.length" class="notices">
        <li v-for="item in room.notices" :key="item.id" @click="room.dismiss(item.id)">
          {{ item.text }}
        </li>
      </ul>

      <p v-if="error" class="error">{{ error }}</p>

      <VictoryScreen
        v-if="showVictory && game"
        :state="room.state"
        :game="game"
        :me-id="meId"
        :busy="busy"
        @play-again="(limit) => guard(() => room.startGame(code, limit))"
        @leave="leave"
      />

      <template v-else-if="showBoard && game">
        <GameScreen
          :state="room.state"
          :game="game"
          :me-id="meId"
          :busy="busy"
          @add-points="(userId, points) => guard(() => room.addPoints(game!.id, userId, points))"
        />
        <EntriesLog
          :state="room.state"
          :game="game"
          :me-id="meId"
          :name-of="room.nameOf"
          :busy="busy"
          @void-entry="(id) => guard(() => room.voidEntry(id))"
          @replace-entry="(id, points) => guard(() => room.replaceEntry(id, points))"
        />
        <button class="btn-quiet" @click="leave">Выйти из комнаты</button>
      </template>

      <WaitingRoom
        v-else
        :state="room.state"
        :me-id="meId"
        :default-limit="defaultLimit"
        :busy="busy"
        @start="(limit) => guard(() => room.startGame(code, limit))"
        @leave="leave"
      />
    </template>

    <div v-else class="center">
      <p class="error">{{ error || 'Комната не найдена' }}</p>
      <RouterLink class="back" to="/">Вернуться в лобби</RouterLink>
    </div>
  </div>
</template>

<style scoped lang="scss">
.room-root {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 800px;
  margin: 0 auto;
  width: 100%;
}

.center {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-muted);
}

.gate {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  max-width: 360px;
  margin: 0 auto;
  width: 100%;
}

.gate-title {
  font-size: 22px;
  font-weight: 700;
}

.field {
  width: 100%;
  padding: 12px 16px;
  border: 2px solid var(--border);
  border-radius: 8px;
  font-size: 16px;
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
  padding: 12px 24px;
  background: var(--btn-bg);
  color: var(--btn-text);
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;

  &:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
}

.btn-quiet {
  align-self: center;
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

.notices {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
  /* Верхний правый угол занят кнопкой темы — не наезжаем на неё. */
  padding-right: 56px;
}

.notices li {
  padding: 8px 12px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 13px;
  color: var(--text-muted);
  cursor: pointer;
}

.back {
  color: var(--text-hint);
  font-size: 14px;
}

.error {
  color: #e05252;
  text-align: center;
  font-size: 14px;
}
</style>

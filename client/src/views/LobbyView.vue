<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useLobbyStore } from '../stores/lobby.js'
import { useSessionStore } from '../stores/session.js'
import { describeError } from '../api.js'
import NicknameEditor from '../components/NicknameEditor.vue'
import AppIcon from '../components/AppIcon.vue'

const lobby = useLobbyStore()
const session = useSessionStore()
const router = useRouter()

const creating = ref(false)
const name = ref('')
const password = ref('')
const busy = ref(false)
const error = ref('')

onMounted(async () => {
  try {
    await lobby.load()
  } catch (err) {
    error.value = describeError(err)
  }
  // Человек мог закрыть вкладку посреди игры — предлагаем вернуться.
  await session.refresh().catch(() => undefined)
})

async function create(): Promise<void> {
  if (name.value.trim() === '' || busy.value) return
  busy.value = true
  error.value = ''
  try {
    const code = await lobby.create(name.value.trim(), password.value || undefined)
    await router.push(`/room/${code}`)
  } catch (err) {
    error.value = describeError(err)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="lobby-root">
    <header class="head">
      <h1 class="title">Комнаты</h1>
      <span class="me">
        <NicknameEditor />
        <RouterLink class="history-link" to="/history">мои игры</RouterLink>
      </span>
    </header>

    <RouterLink
      v-if="session.user?.activeRoomCode"
      class="resume"
      :to="`/room/${session.user.activeRoomCode}`"
    >
      Вернуться в свою комнату {{ session.user.activeRoomCode }}
    </RouterLink>

    <div v-if="creating" class="create-form">
      <input v-model="name" class="field" maxlength="40" placeholder="Название комнаты" />
      <input
        v-model="password"
        class="field"
        type="password"
        maxlength="100"
        placeholder="Пароль (необязательно)"
        @keydown.enter="create"
      />
      <div class="row">
        <button class="btn-primary" :disabled="name.trim() === '' || busy" @click="create">
          Создать
        </button>
        <button class="btn-quiet" @click="creating = false">Отмена</button>
      </div>
    </div>
    <button v-else class="btn-primary" @click="creating = true">Создать комнату</button>

    <p v-if="error" class="error">{{ error }}</p>

    <p v-if="lobby.loading" class="empty">Загружаем…</p>
    <p v-else-if="lobby.rooms.length === 0" class="empty">
      Пока пусто. Создайте комнату и позовите друзей ссылкой.
    </p>

    <ul v-else class="rooms">
      <li v-for="room in lobby.rooms" :key="room.id">
        <RouterLink class="room" :to="`/room/${room.code}`">
          <span class="room-name">{{ room.name }}</span>
          <span class="room-meta">
            <AppIcon v-if="room.hasPassword" name="lock" :size="15" title="Нужен пароль" />
            <span>{{ room.memberCount }} чел.</span>
            <span v-if="room.gameActive" class="playing">идёт игра</span>
          </span>
        </RouterLink>
      </li>
    </ul>
  </div>
</template>

<style scoped lang="scss">
.lobby-root {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 600px;
  margin: 0 auto;
  width: 100%;
}

.head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.title {
  font-size: 28px;
  font-weight: 700;
}

.me {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  color: var(--text-muted);
}

.history-link {
  font-size: 13px;
  color: var(--text-hint);

  &:hover {
    color: var(--text-muted);
  }
}

.resume {
  padding: 12px 16px;
  border: 2px solid var(--btn-bg);
  border-radius: 8px;
  text-decoration: none;
  color: var(--text);
  text-align: center;
}

.create-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field {
  padding: 12px 16px;
  border: 2px solid var(--border);
  border-radius: 8px;
  font-size: 16px;
  background: var(--bg-card);
  color: var(--text);

  &:focus {
    outline: none;
    border-color: var(--btn-bg);
  }
}

/*
 * Ширину делят только кнопки в паре. Раньше `flex: 1` стоял на самой кнопке, и
 * «Создать комнату» — она лежит прямо в колонке экрана — растягивалась на всю
 * свободную высоту, закрывая собой список комнат.
 */
.row {
  display: flex;
  gap: 8px;

  > * {
    flex: 1;
  }
}

.btn-primary {
  padding: 12px 24px;
  background: var(--btn-bg);
  color: var(--btn-text);
  border: none;
  border-radius: 8px;
  font-size: 16px;
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
}

.rooms {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.room {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px;
  background: var(--bg-card);
  border: 2px solid var(--border);
  border-radius: 12px;
  text-decoration: none;
  color: var(--text);
  transition: all 0.15s;

  &:hover {
    border-color: var(--border-hover);
  }
}

.room-name {
  font-size: 17px;
  font-weight: 500;
}

.room-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--text-hint);
  font-size: 14px;
}

.playing {
  color: var(--text-muted);
}

.empty,
.error {
  text-align: center;
  color: var(--text-hint);
}

.error {
  color: #e05252;
}
</style>

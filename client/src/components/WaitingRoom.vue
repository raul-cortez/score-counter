<script setup lang="ts">
import { nextTick, ref } from 'vue'
import type { PublicUser, RoomState } from '@score/shared'
import AppIcon from './AppIcon.vue'

const props = defineProps<{
  state: RoomState
  meId: string
  /** Подставляется лимит прошлой игры: рестарт тем же лимитом — одно нажатие. */
  defaultLimit: number
  busy: boolean
}>()

const emit = defineEmits<{
  start: [scoreLimit: number]
  'rename-room': [name: string]
  'close-room': []
  'remove-member': [userId: string]
  'rename-member': [userId: string, nickname: string]
}>()

const scoreLimit = ref(props.defaultLimit)
const copied = ref(false)

const MIN_PLAYERS = 2

async function copyInvite(): Promise<void> {
  await navigator.clipboard.writeText(`${location.origin}/room/${props.state.room.code}`)
  copied.value = true
  setTimeout(() => (copied.value = false), 2000)
}

/**
 * Переименование комнаты — тем же приёмом, что и смена своего имени: карандаш,
 * поле, значки готово/отмена, только тут его видит один хост.
 */
const editingRoom = ref(false)
const roomDraft = ref('')
const roomInputRef = ref<HTMLInputElement | null>(null)

async function startRoomEdit(): Promise<void> {
  roomDraft.value = props.state.room.name
  editingRoom.value = true
  await nextTick()
  roomInputRef.value?.focus()
  roomInputRef.value?.select()
}

function cancelRoomEdit(): void {
  editingRoom.value = false
}

function saveRoomName(): void {
  const next = roomDraft.value.trim()
  editingRoom.value = false
  if (next === '' || next === props.state.room.name) return
  emit('rename-room', next)
}

/**
 * Удаление и убирание участника — необратимые для другого человека действия,
 * поэтому спрашиваем подтверждение системным диалогом: он редкий гость в этом
 * приложении, но заводить свой модальный компонент ради пары кнопок не стоит.
 */
function requestClose(): void {
  if (window.confirm('Удалить комнату? Партии останутся в истории, но зайти сюда будет нельзя.')) {
    emit('close-room')
  }
}

function requestRemove(member: PublicUser): void {
  if (window.confirm(`Убрать ${member.nickname} из комнаты?`)) {
    emit('remove-member', member.id)
  }
}

function requestRename(member: PublicUser): void {
  const next = window.prompt(`Новое имя для ${member.nickname}`, member.nickname)
  if (next === null) return
  const trimmed = next.trim()
  if (trimmed === '' || trimmed === member.nickname) return
  emit('rename-member', member.id, trimmed)
}
</script>

<template>
  <div class="waiting-root">
    <div class="title-row">
      <template v-if="editingRoom">
        <input
          ref="roomInputRef"
          v-model="roomDraft"
          class="name-field"
          type="text"
          placeholder="Название"
          @keydown.enter="saveRoomName"
          @keydown.esc="cancelRoomEdit"
        />
        <button class="btn-tiny" type="button" title="Готово" @click="saveRoomName">
          <AppIcon name="check" :size="15" />
        </button>
        <button class="btn-tiny" type="button" title="Отмена" @click="cancelRoomEdit">
          <AppIcon name="close" :size="15" />
        </button>
      </template>
      <template v-else>
        <h1 class="title">{{ state.room.name }}</h1>
        <button
          v-if="meId === state.room.hostUserId"
          class="btn-tiny"
          type="button"
          title="Переименовать комнату"
          @click="startRoomEdit"
        >
          <AppIcon name="pencil" :size="14" />
        </button>
      </template>
    </div>

    <button class="code" @click="copyInvite">
      {{ copied ? 'Ссылка скопирована' : `Код ${state.room.code} — скопировать ссылку` }}
    </button>

    <ul class="members">
      <li v-for="member in state.members" :key="member.id" class="member">
        <span class="dot" :class="{ on: state.online.includes(member.id) }" />
        <span class="nick">{{ member.nickname }}</span>
        <AppIcon v-if="member.id === state.room.hostUserId" name="crown" :size="15" title="Хост" />
        <span v-if="member.id === meId" class="you">вы</span>
        <template v-if="meId === state.room.hostUserId && member.id !== meId">
          <button
            class="btn-tiny"
            type="button"
            title="Переименовать участника"
            @click="requestRename(member)"
          >
            <AppIcon name="pencil" :size="13" />
          </button>
          <button
            class="btn-tiny"
            type="button"
            title="Убрать из комнаты"
            @click="requestRemove(member)"
          >
            <AppIcon name="close" :size="13" />
          </button>
        </template>
      </li>
    </ul>

    <template v-if="meId === state.room.hostUserId">
      <label class="limit">
        <span>Играем до</span>
        <input v-model.number="scoreLimit" class="limit-input" type="number" min="1" max="10000" />
      </label>

      <button
        class="btn-primary"
        :disabled="state.members.length < MIN_PLAYERS || scoreLimit < 1 || busy"
        @click="emit('start', scoreLimit)"
      >
        Начать игру
      </button>
      <p v-if="state.members.length < MIN_PLAYERS" class="hint">
        Нужен хотя бы ещё один игрок — отправьте им ссылку.
      </p>
    </template>
    <p v-else class="hint">Ждём, пока хост начнёт игру.</p>

    <!--
      Хост мог уже смениться, а создатель — нет: он заводил комнату и вправе
      закрыть её в любой момент, даже перестав быть хостом.
    -->
    <button
      v-if="meId === state.room.hostUserId || meId === state.room.creatorUserId"
      class="btn-quiet danger"
      type="button"
      :disabled="busy"
      @click="requestClose"
    >
      Удалить комнату
    </button>

  </div>
</template>

<style scoped lang="scss">
.waiting-root {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 500px;
  margin: 0 auto;
  width: 100%;
}

.title-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  flex-wrap: wrap;
  padding-right: 56px;
}

.title {
  font-size: 26px;
  font-weight: 700;
  text-align: center;
}

.name-field {
  width: 220px;
  padding: 6px 10px;
  border: 2px solid var(--border);
  border-radius: 6px;
  background: var(--bg-card);
  color: var(--text);
  font-size: 17px;
  text-align: center;

  &:focus {
    outline: none;
    border-color: var(--btn-bg);
  }
}

.btn-tiny {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  flex-shrink: 0;
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

.code {
  padding: 12px 16px;
  border: 2px dashed var(--border);
  border-radius: 8px;
  background: transparent;
  color: var(--text-muted);
  font-size: 15px;
  cursor: pointer;

  &:hover {
    border-color: var(--border-hover);
  }
}

.members {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.member {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  background: var(--bg-card);
  border: 2px solid var(--border);
  border-radius: 8px;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--border);
  flex-shrink: 0;

  &.on {
    background: #4caf50;
  }
}

.nick {
  flex: 1;
}

.you {
  font-size: 11px;
  text-transform: uppercase;
  color: var(--text-hint);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 1px 4px;
}

.limit {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--text-muted);
}

.limit-input {
  width: 120px;
  padding: 10px 12px;
  border: 2px solid var(--border);
  border-radius: 8px;
  font-size: 17px;
  text-align: center;
  background: var(--bg-card);
  color: var(--text);

  &:focus {
    outline: none;
    border-color: var(--btn-bg);
  }
}

.btn-primary {
  padding: 14px 24px;
  background: var(--btn-bg);
  color: var(--btn-text);
  border: none;
  border-radius: 8px;
  font-size: 17px;
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

  &:hover:not(:disabled) {
    border-color: var(--border-hover);
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
}

.btn-quiet.danger {
  align-self: center;
  color: #e05252;
  border-color: #e0525255;

  &:hover:not(:disabled) {
    border-color: #e05252;
  }
}

.hint {
  text-align: center;
  color: var(--text-hint);
  font-size: 14px;
}
</style>

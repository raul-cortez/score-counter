<script setup lang="ts">
import { computed, ref } from 'vue'
import type { GameDetails, RoomState } from '@score/shared'

const props = defineProps<{
  state: RoomState
  game: GameDetails
  meId: string
  nameOf: (userId: string) => string
  busy: boolean
}>()

const emit = defineEmits<{
  voidEntry: [entryId: string]
  replaceEntry: [entryId: string, points: number]
}>()

const editingId = ref<string | null>(null)
const editValue = ref('')

const isHost = computed(() => props.meId === props.state.room.hostUserId)

/** Те же правила, что на сервере: свою запись правит любой, чужую — только хост. */
function mayEdit(userId: string): boolean {
  if (!props.game.players.some((player) => player.id === props.meId)) return false
  return userId === props.meId || isHost.value
}

/** Новые записи сверху: только что записанное исправляют чаще всего. */
const rows = computed(() => [...props.game.entries].reverse())

function startEdit(entryId: string, points: number): void {
  editingId.value = entryId
  editValue.value = String(points)
}

function commit(entryId: string): void {
  const points = Number.parseInt(editValue.value, 10)
  if (Number.isNaN(points) || points < 1 || props.busy) return
  emit('replaceEntry', entryId, points)
  editingId.value = null
}
</script>

<template>
  <section class="log-root">
    <h2 class="title">Раздачи</h2>

    <p v-if="rows.length === 0" class="empty">Пока никто ничего не записал.</p>

    <ul v-else class="rows">
      <li v-for="row in rows" :key="row.id" class="row" :class="{ voided: row.voidedAt !== null }">
        <span class="who">{{ nameOf(row.userId) }}</span>

        <template v-if="editingId === row.id">
          <input
            v-model="editValue"
            class="edit-input"
            type="number"
            min="1"
            autofocus
            @keydown.enter="commit(row.id)"
            @keydown.esc="editingId = null"
          />
          <button class="btn-tiny" :disabled="busy" @click="commit(row.id)">Сохранить</button>
          <button class="btn-tiny" @click="editingId = null">Отмена</button>
        </template>

        <template v-else>
          <span class="points">+{{ row.points }}</span>
          <span v-if="row.voidedAt !== null" class="mark">отменено</span>
          <template v-else-if="mayEdit(row.userId)">
            <button class="btn-tiny" :disabled="busy" @click="startEdit(row.id, row.points)">
              Исправить
            </button>
            <button class="btn-tiny" :disabled="busy" @click="emit('voidEntry', row.id)">
              Отменить
            </button>
          </template>
        </template>
      </li>
    </ul>
  </section>
</template>

<style scoped lang="scss">
.log-root {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-muted);
}

.rows {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 260px;
  overflow-y: auto;
}

.row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: var(--bg-card);
  border: 2px solid var(--border);
  border-radius: 8px;
  font-size: 15px;

  &.voided {
    opacity: 0.5;
  }
}

.who {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.points {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.voided .points {
  text-decoration: line-through;
}

.mark {
  font-size: 12px;
  color: var(--text-hint);
  text-transform: uppercase;
}

.edit-input {
  width: 90px;
  padding: 6px 8px;
  border: 2px solid var(--btn-bg);
  border-radius: 6px;
  font-size: 15px;
  text-align: center;
  background: var(--bg-card);
  color: var(--text);

  &:focus {
    outline: none;
  }
}

.btn-tiny {
  padding: 6px 10px;
  background: transparent;
  color: var(--text-hint);
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;

  &:hover:not(:disabled) {
    border-color: var(--border-hover);
    color: var(--text-muted);
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
}
</style>

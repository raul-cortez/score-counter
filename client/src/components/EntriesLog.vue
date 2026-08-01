<script setup lang="ts">
import { computed, ref } from 'vue'
import type { GameDetails, RoomState } from '@score/shared'
import { parsePoints } from '../points.js'
import AppIcon from './AppIcon.vue'

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

/**
 * Журнал закрыт, пока его не спросили.
 *
 * За столом смотрят на табло, а в раздачи лезут за конкретным — поправить или
 * вспомнить, кто когда взял. Раскрытый он занимал экран целиком и всё равно
 * показывал только часть, потому что прокручивался внутри себя.
 */
const open = ref(false)

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

/** Исправляют тем же способом, каким записывали: сумма понимается и здесь. */
function commit(entryId: string): void {
  const points = parsePoints(editValue.value)
  if (points === null || points < 1 || props.busy) return
  emit('replaceEntry', entryId, points)
  editingId.value = null
}
</script>

<template>
  <section class="log-root">
    <!--
      Журнал свёрнут по умолчанию и разворачивается целиком.
      Раньше он висел под табло со своей полосой прокрутки: на телефоне палец
      попадал в неё вместо страницы, а список всё равно был виден кусочком.
    -->
    <button class="title" type="button" :aria-expanded="open" @click="open = !open">
      <AppIcon class="chevron" :class="{ open }" name="chevron" :size="16" />
      <span>Раздачи</span>
      <span v-if="rows.length" class="count">{{ rows.length }}</span>
    </button>

    <div class="body" :class="{ open }">
      <div class="body-inner">
        <p v-if="rows.length === 0" class="empty">Пока никто ничего не записал.</p>

        <ul v-else class="rows">
          <li
            v-for="row in rows"
            :key="row.id"
            class="row"
            :class="{ voided: row.voidedAt !== null }"
          >
            <span class="who">{{ nameOf(row.userId) }}</span>

            <template v-if="editingId === row.id">
              <!-- Та же телефонная панель, что и при записи: плюс нужен и здесь. -->
              <input
                v-model="editValue"
                class="edit-input"
                type="tel"
                inputmode="tel"
                autocomplete="off"
                autocorrect="off"
                spellcheck="false"
                enterkeyhint="done"
                maxlength="40"
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
      </div>
    </div>
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
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  background: none;
  border: none;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-muted);
  cursor: pointer;
  text-align: left;

  &:hover {
    color: var(--text);
  }
}

.count {
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  font-size: 12px;
  font-weight: 500;
  color: var(--text-hint);
}

.chevron {
  transition: transform 0.2s ease;

  &.open {
    transform: rotate(180deg);
  }
}

/*
 * Раскрытие через строки грида: высота содержимого заранее неизвестна, а `0fr → 1fr`
 * даёт плавность без её измерения и без прыжка в конце.
 */
.body {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 0.25s ease;

  &.open {
    grid-template-rows: 1fr;
  }
}

.body-inner {
  overflow: hidden;
}

/* Прокрутки у журнала своей нет: раскрылся — значит целиком. */
.rows {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .body,
  .chevron {
    transition: none;
  }
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

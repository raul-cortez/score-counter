<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import type { GameDetails, RoomState } from '@score/shared'
import PlayerCard from './PlayerCard.vue'
import { looksLikeSum, parsePoints } from '../points.js'

const props = defineProps<{
  state: RoomState
  game: GameDetails
  meId: string
  busy: boolean
}>()

const emit = defineEmits<{ addPoints: [userId: string, points: number] }>()

const selectedId = ref<string | null>(null)
const pointsInput = ref('')
const inputRef = ref<HTMLInputElement | null>(null)

const isHost = computed(() => props.meId === props.state.room.hostUserId)

const iAmPlayer = computed(() => props.game.players.some((player) => player.id === props.meId))

/**
 * Обычному игроку выбирать некого: писать он может только себе.
 *
 * Раньше поле открывалось только после нажатия на собственную карточку — лишний
 * тап, который приходилось делать перед каждой записью, и который ничего не решал.
 * Теперь поле стоит открытым, а карточки для него просто табло.
 */
const fixedToMe = computed(() => iAmPlayer.value && !isHost.value)

/** Себе — всегда, другому — только хост. Те же правила, что и на сервере. */
function mayWriteFor(userId: string): boolean {
  if (!iAmPlayer.value) return false
  return userId === props.meId || isHost.value
}

const selectedName = computed(
  () => props.game.players.find((player) => player.id === selectedId.value)?.nickname ?? '',
)

async function focusInput(): Promise<void> {
  await nextTick()
  inputRef.value?.focus()
}

/**
 * Роль может смениться прямо посреди партии — хост ушёл, и она перешла соседу.
 * Тогда поле либо закрепляется за собой, либо снова становится выбираемым.
 */
watch(
  fixedToMe,
  (fixed) => {
    if (fixed) selectedId.value = props.meId
    else if (selectedId.value === props.meId) selectedId.value = null
  },
  { immediate: true },
)

onMounted(() => {
  if (fixedToMe.value) void focusInput()
})

async function select(userId: string): Promise<void> {
  if (!mayWriteFor(userId)) return
  // Себе и так открыто — нажатие на свою карточку просто возвращает курсор в поле.
  if (fixedToMe.value) {
    await focusInput()
    return
  }

  if (selectedId.value === userId) {
    selectedId.value = null
    return
  }
  selectedId.value = userId
  pointsInput.value = ''
  await focusInput()
}

/** Ноль и минус в итоге не записываем: сервер их отвергнет, а кнопка объяснит раньше. */
const points = computed(() => {
  const value = parsePoints(pointsInput.value)
  return value === null || value < 1 ? null : value
})

/**
 * Подпись под полем. Про сумму говорим только когда она набрана: показывать
 * «35 = 35» на обычном числе — шум.
 */
const hint = computed(() => {
  if (pointsInput.value.trim() === '') return null
  if (points.value === null) return 'так не посчитать'
  return looksLikeSum(pointsInput.value) ? `= ${points.value}` : null
})

/**
 * Плюс кнопкой, а не только с клавиатуры: цифровая клавиатура телефона его не
 * показывает, а переключаться на буквенную ради одного знака — то самое неудобство,
 * от которого сумма в поле и должна избавить.
 */
async function appendPlus(): Promise<void> {
  const current = pointsInput.value.trim()
  if (current === '' || /[+-]$/.test(current)) return

  pointsInput.value = `${current}+`
  await focusInput()
}

function submit(): void {
  if (selectedId.value === null || points.value === null || props.busy) return

  emit('addPoints', selectedId.value, points.value)
  pointsInput.value = ''

  // Хост пишет по очереди разным людям, поэтому у него выбор сбрасывается. Тому,
  // кто пишет только себе, сбрасывать нечего: остаётся набрать следующую раздачу.
  if (fixedToMe.value) void focusInput()
  else selectedId.value = null
}
</script>

<template>
  <div class="game-root">
    <div class="header">
      <span class="limit-info">Играем до {{ game.scoreLimit }}</span>
    </div>

    <div class="cards">
      <PlayerCard
        v-for="player in game.players"
        :key="player.id"
        :player="player"
        :score="game.scores[player.id] ?? 0"
        :score-limit="game.scoreLimit"
        :selected="selectedId === player.id"
        :online="state.online.includes(player.id)"
        :is-you="player.id === meId"
        :is-host="player.id === state.room.hostUserId"
        @select="select(player.id)"
      />
    </div>

    <div v-if="selectedId !== null" class="controls" :class="{ fixed: fixedToMe }">
      <div class="field">
        <span class="for-whom">{{ fixedToMe ? 'Ваши очки' : selectedName }}</span>
        <!--
          Клавиатура телефонная, а не числовая. `inputmode="numeric"` на iOS даёт
          панель из одних цифр — плюс на ней взять негде, а местами Safari и вовсе
          показывает буквенную. На телефонной панели есть «+*#», и плюс набирается
          с неё. `type="tel"` продублирован ради старых iOS, которые про inputmode
          не знают вовсе; автозамену и подсказки гасим, чтобы они не лезли в цифры.

          Подсказка в поле короткая: длиннее семи знаков там не помещается, и
          «Очки или 35+56» обрезалось на полуслове.
        -->
        <input
          ref="inputRef"
          v-model="pointsInput"
          type="tel"
          inputmode="tel"
          autocomplete="off"
          autocorrect="off"
          spellcheck="false"
          enterkeyhint="done"
          maxlength="40"
          class="points-input"
          placeholder="35+56"
          @keydown.enter="submit"
        />
        <!-- Рисуется всегда, даже пустой: место под подпись держит панель от прыжка. -->
        <span class="sum-hint" :class="{ bad: points === null }">{{ hint }}</span>
      </div>
      <button class="btn-plus" :disabled="!pointsInput.trim()" @click="appendPlus">+</button>
      <button class="btn-add" :disabled="points === null || busy" @click="submit">Добавить</button>
    </div>
    <!-- Подсказка нужна только там, где выбор действительно есть: хосту и зрителю. -->
    <p v-else class="pick-hint">
      {{ iAmPlayer ? 'Нажмите на игрока, чтобы записать очки' : 'Вы не в составе этой партии' }}
    </p>
  </div>
</template>

<style scoped lang="scss">
.game-root {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
}

.header {
  text-align: center;
}

.limit-info {
  font-size: 16px;
  color: var(--text-muted);
}

.cards {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;

  @media (min-width: 600px) {
    grid-template-columns: repeat(3, 1fr);
  }

  @media (min-width: 900px) {
    grid-template-columns: repeat(4, 1fr);
  }
}

.controls {
  display: flex;
  align-items: center;
  gap: 12px;
  position: sticky;
  bottom: 20px;
  background: var(--bg-card);
  padding: 16px;
  border-radius: 12px;
  box-shadow: 0 4px 20px var(--shadow);
  z-index: 10;
}

/** Место под подпись держится всегда: иначе панель подпрыгивает на каждом плюсе. */
.field {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.for-whom {
  font-weight: 600;
  white-space: nowrap;
  font-size: 14px;
}

.sum-hint {
  min-height: 16px;
  font-size: 13px;
  text-align: center;
  color: var(--text-muted);

  &.bad {
    color: #e05252;
  }
}

.btn-plus {
  padding: 12px 18px;
  font-size: 20px;
  font-weight: 600;
  line-height: 1;
  background: var(--bg-card);
  color: var(--text);
  border: 2px solid var(--border);
  border-radius: 8px;
  cursor: pointer;

  &:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
}

/*
 * Когда поле закреплено за собой, оно и есть главное действие на экране — держим
 * его подсвеченным, а не сливающимся с рамками карточек.
 */
.controls.fixed .points-input {
  border-color: var(--btn-bg);
}

.points-input {
  width: 100%;
  min-width: 0;
  padding: 12px 16px;
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

  &::-webkit-outer-spin-button,
  &::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
}

.btn-add {
  padding: 12px 24px;
  background: var(--btn-bg);
  color: var(--btn-text);
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;

  &:hover:not(:disabled) {
    background: var(--btn-hover);
  }

  &:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
}

.pick-hint {
  text-align: center;
  color: var(--text-hint);
  font-size: 14px;
}
</style>

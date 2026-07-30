<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import type { GameHistoryDetails } from '@score/shared'
import { useHistoryStore } from '../stores/history.js'
import { useSessionStore } from '../stores/session.js'
import { describeError } from '../api.js'
import { formatPlayedAt } from '../formatDate.js'

const history = useHistoryStore()
const session = useSessionStore()
const route = useRoute()

const game = ref<GameHistoryDetails | null>(null)
const error = ref('')
const loading = ref(true)

const nameOf = computed<(userId: string) => string>(() => {
  const known = new Map(game.value?.players.map((player) => [player.id, player.nickname]))
  return (userId: string) => known.get(userId) ?? 'кто-то'
})

/** Итог партии: победитель сверху, дальше по убыванию очков. */
const standings = computed(() =>
  [...(game.value?.players ?? [])].sort(
    (a, b) => (game.value?.scores[b.id] ?? 0) - (game.value?.scores[a.id] ?? 0),
  ),
)

/** Раздачи в порядке, в котором их записывали. */
const entries = computed(() => game.value?.entries ?? [])

onMounted(async () => {
  try {
    game.value = await history.loadGame(String(route.params.gameId))
  } catch (err) {
    error.value = describeError(err)
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="detail-root">
    <header class="head">
      <RouterLink class="back" to="/history">← Мои игры</RouterLink>
      <h1 v-if="game" class="title">{{ game.roomName }}</h1>
    </header>

    <p v-if="loading" class="empty">Загружаем…</p>
    <p v-else-if="error" class="error">{{ error }}</p>

    <template v-else-if="game">
      <p class="when">
        {{ formatPlayedAt(game.startedAt) }} · играли до {{ game.scoreLimit }}
      </p>

      <ul class="standings">
        <li v-for="(player, index) in standings" :key="player.id" class="place">
          <span class="rank">{{ index + 1 }}</span>
          <span class="nick">
            {{ player.nickname }}
            <span v-if="player.id === session.user?.id" class="you">вы</span>
            <span v-if="player.id === game.winnerUserId" title="Победитель">🏆</span>
          </span>
          <span class="place-score">{{ game.scores[player.id] ?? 0 }}</span>
        </li>
      </ul>

      <section>
        <h2 class="section-title">Раздачи</h2>
        <p v-if="entries.length === 0" class="empty">В этой партии никто ничего не записал.</p>
        <ol v-else class="entries">
          <li
            v-for="(item, index) in entries"
            :key="item.id"
            class="entry"
            :class="{ voided: item.voidedAt !== null }"
          >
            <span class="entry-no">{{ index + 1 }}</span>
            <span class="entry-who">{{ nameOf(item.userId) }}</span>
            <span class="entry-points">+{{ item.points }}</span>
            <span v-if="item.voidedAt !== null" class="entry-mark">отменено</span>
          </li>
        </ol>
      </section>
    </template>
  </div>
</template>

<style scoped lang="scss">
.detail-root {
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
  flex-direction: column;
  gap: 6px;
  padding-right: 56px;
}

.back {
  color: var(--text-hint);
  text-decoration: none;
  font-size: 14px;

  &:hover {
    color: var(--text-muted);
  }
}

.title {
  font-size: 26px;
  font-weight: 700;
}

.when {
  color: var(--text-hint);
  font-size: 14px;
}

.standings {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.place {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--bg-card);
  border: 2px solid var(--border);
  border-radius: 8px;

  &:first-child {
    border-color: var(--btn-bg);
  }
}

.rank {
  color: var(--text-hint);
  font-variant-numeric: tabular-nums;
  width: 18px;
}

.nick {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}

.you {
  font-size: 11px;
  text-transform: uppercase;
  color: var(--text-hint);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 1px 4px;
}

.place-score {
  font-size: 20px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.section-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-muted);
  margin-bottom: 8px;
}

.entries {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.entry {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 14px;

  &.voided {
    opacity: 0.5;
  }
}

.entry-no {
  color: var(--text-hint);
  font-variant-numeric: tabular-nums;
  min-width: 20px;
}

.entry-who {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.entry-points {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.voided .entry-points {
  text-decoration: line-through;
}

.entry-mark {
  font-size: 11px;
  text-transform: uppercase;
  color: var(--text-hint);
}

.empty {
  color: var(--text-hint);
  text-align: center;
}

.error {
  color: #e05252;
  text-align: center;
}
</style>

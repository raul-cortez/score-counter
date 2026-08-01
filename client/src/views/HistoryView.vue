<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { GameHistoryItem } from '@score/shared'
import { useHistoryStore } from '../stores/history.js'
import { useSessionStore } from '../stores/session.js'
import { describeError } from '../api.js'
import { formatPlayedAt } from '../formatDate.js'
import AppIcon from '../components/AppIcon.vue'

const history = useHistoryStore()
const session = useSessionStore()
const error = ref('')

onMounted(async () => {
  try {
    await history.load()
  } catch (err) {
    error.value = describeError(err)
  }
})

function outcome(game: GameHistoryItem): string {
  if (game.status === 'active') return 'идёт'
  if (game.status === 'abandoned') return 'брошена'
  return game.winnerUserId === session.user?.id ? 'победа' : 'поражение'
}

/** Соперники — все, кроме себя: своё имя в списке «с кем играл» лишнее. */
function opponents(game: GameHistoryItem): string {
  return game.players
    .filter((player) => player.id !== session.user?.id)
    .map((player) => player.nickname)
    .join(', ')
}
</script>

<template>
  <div class="history-root">
    <header class="head">
      <RouterLink class="back" to="/"><AppIcon name="back" :size="16" />Лобби</RouterLink>
      <h1 class="title">Мои игры</h1>
    </header>

    <p v-if="error" class="error">{{ error }}</p>
    <p v-else-if="history.loading" class="empty">Загружаем…</p>

    <template v-else>
      <div v-if="history.stats" class="stats">
        <div class="stat">
          <span class="stat-value">{{ history.stats.gamesPlayed }}</span>
          <span class="stat-label">партий</span>
        </div>
        <div class="stat">
          <span class="stat-value">{{ history.stats.wins }}</span>
          <span class="stat-label">побед</span>
        </div>
        <div class="stat">
          <span class="stat-value">{{ history.stats.bestScore }}</span>
          <span class="stat-label">лучший счёт</span>
        </div>
      </div>

      <section v-if="history.stats?.opponents.length" class="opponents">
        <h2 class="section-title">С кем играю</h2>
        <ul class="opponent-list">
          <li v-for="item in history.stats.opponents" :key="item.user.id" class="opponent">
            <span class="opponent-name">{{ item.user.nickname }}</span>
            <span class="opponent-meta">
              {{ item.games }} партий, из них выиграл {{ item.theirWins }}
            </span>
          </li>
        </ul>
      </section>

      <section>
        <h2 class="section-title">Партии</h2>
        <p v-if="history.games.length === 0" class="empty">
          Пока пусто. Сыграйте партию — она появится здесь.
        </p>
        <ul v-else class="games">
          <li v-for="game in history.games" :key="game.id">
            <RouterLink class="game" :to="`/history/${game.id}`">
              <span class="game-top">
                <span class="game-room">{{ game.roomName }}</span>
                <span class="game-outcome" :class="outcome(game)">{{ outcome(game) }}</span>
              </span>
              <span class="game-bottom">
                <span>{{ formatPlayedAt(game.startedAt) }}</span>
                <span class="game-score">{{ game.myScore }} из {{ game.scoreLimit }}</span>
              </span>
              <span v-if="opponents(game)" class="game-with">с {{ opponents(game) }}</span>
            </RouterLink>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>

<style scoped lang="scss">
.history-root {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 20px;
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
  font-size: 28px;
  font-weight: 700;
}

.stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 16px 8px;
  background: var(--bg-card);
  border: 2px solid var(--border);
  border-radius: 12px;
}

.stat-value {
  font-size: 28px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.stat-label {
  font-size: 12px;
  color: var(--text-hint);
  text-align: center;
}

.section-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-muted);
  margin-bottom: 8px;
}

.opponent-list,
.games {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.opponent {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  background: var(--bg-card);
  border: 2px solid var(--border);
  border-radius: 8px;
}

.opponent-name {
  font-weight: 500;
}

.opponent-meta {
  font-size: 13px;
  color: var(--text-hint);
  text-align: right;
}

.game {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px 16px;
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

.game-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.game-room {
  font-size: 17px;
  font-weight: 500;
}

.game-outcome {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-hint);

  &.победа {
    color: #4caf50;
  }
}

.game-bottom {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
  color: var(--text-hint);
}

.game-score {
  font-variant-numeric: tabular-nums;
}

.game-with {
  font-size: 13px;
  color: var(--text-muted);
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

# План 1. Сервер: фундамент и игровая логика

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Рабочий бэкенд, в котором можно завести гостя, создать комнату с паролем, войти в неё, стартовать игру, дописывать и отменять очки и получить победителя при достижении лимита — всё покрыто тестами.

**Architecture:** Один процесс Fastify поверх SQLite. Игровая логика вынесена в `server/src/domain/` чистыми функциями без обращений к базе и HTTP — там же основная масса тестов. `repo/` инкапсулирует SQL, `routes/` валидирует вход и связывает эти два слоя. Текущий счёт нигде не кэшируется: он считается по журналу `score_entries` при каждом запросе.

**Tech Stack:** Node 22, TypeScript 5, Fastify 5, better-sqlite3, @node-rs/argon2, Vitest, pnpm workspaces, tsup.

**Спека:** `docs/superpowers/specs/2026-07-30-multiplayer-score-counter-design.md`

**Что в этот план не входит:** SSE и журнал событий, presence и автопередача хоста, история и статистика, клиент, PWA, деплой. Это планы 2–4.

---

## Карта файлов

| Файл | Ответственность |
|---|---|
| `pnpm-workspace.yaml` | Состав монорепо |
| `shared/src/index.ts` | Типы, общие для клиента и сервера |
| `server/src/db/schema.ts` | DDL одной строкой-константой |
| `server/src/db/index.ts` | Открытие базы, прагмы, применение схемы |
| `server/src/domain/score.ts` | Подсчёт счёта по журналу |
| `server/src/domain/victory.ts` | Кто первым перешёл лимит |
| `server/src/domain/permissions.ts` | Кому что позволено |
| `server/src/domain/code.ts` | Генерация кода комнаты |
| `server/src/auth/tokens.ts` | Создание и хэширование токена сессии |
| `server/src/repo/users.ts` | SQL по `users` |
| `server/src/repo/sessions.ts` | SQL по `sessions` |
| `server/src/repo/rooms.ts` | SQL по `rooms` и `room_members` |
| `server/src/repo/games.ts` | SQL по `games` и `game_players` |
| `server/src/repo/entries.ts` | SQL по `score_entries` |
| `server/src/plugins/auth.ts` | Разбор `Bearer`-токена, `requireAuth` |
| `server/src/routes/auth.ts` | `/api/auth/*`, `/api/me` |
| `server/src/routes/rooms.ts` | `/api/rooms/*` |
| `server/src/routes/games.ts` | Старт игры |
| `server/src/routes/entries.ts` | Запись и отмена очков |
| `server/src/app.ts` | Сборка приложения из плагинов и маршрутов |
| `server/src/server.ts` | Точка входа: открыть базу, слушать порт |

Схема лежит в `.ts`, а не в `.sql`, намеренно: так она попадает в бандл сама и её не нужно копировать при сборке.

---

## Task 1: Перевести проект в pnpm-workspaces

**Files:**
- Create: `pnpm-workspace.yaml`, `shared/package.json`, `shared/src/index.ts`, `server/package.json`, `server/tsconfig.json`, `server/vitest.config.ts`, `client/package.json`
- Modify: `package.json`, `tsconfig.json`
- Move: `src/` → `client/src/`, `index.html` → `client/index.html`, `vite.config.ts` → `client/vite.config.ts`, `tsconfig.node.json` → `client/tsconfig.node.json`
- Delete: `package-lock.json`, `dist/`

Структурная задача, тестов нет — проверка в том, что клиент по-прежнему собирается.

- [ ] **Step 1: Переместить существующий фронт в `client/`**

```bash
mkdir -p client
git mv src client/src
git mv index.html client/index.html
git mv vite.config.ts client/vite.config.ts
git mv tsconfig.node.json client/tsconfig.node.json
git mv tsconfig.json client/tsconfig.json
git rm -q package-lock.json
rm -rf dist node_modules
```

- [ ] **Step 2: Создать `pnpm-workspace.yaml`**

```yaml
packages:
  - client
  - server
  - shared
```

- [ ] **Step 3: Заменить корневой `package.json`**

```json
{
  "name": "score-counter",
  "private": true,
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev:client": "pnpm --filter client dev",
    "dev:server": "pnpm --filter server dev",
    "build": "pnpm --filter shared build && pnpm --filter server build && pnpm --filter client build",
    "test": "pnpm --filter server test",
    "typecheck": "pnpm -r typecheck"
  },
  "devDependencies": {
    "typescript": "^5.6.0"
  },
  "packageManager": "pnpm@9.15.0"
}
```

- [ ] **Step 4: Создать пакет `shared`**

`shared/package.json`:

```json
{
  "name": "@score/shared",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "build": "echo 'source-only package'",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.6.0"
  }
}
```

`shared/src/index.ts`:

```ts
export type GameStatus = 'active' | 'finished' | 'abandoned'

export type PublicUser = {
  id: string
  nickname: string
  hasEmail: boolean
}

export type ScoreEntry = {
  seq: number
  id: string
  gameId: string
  userId: string
  points: number
  createdBy: string
  createdAt: number
  voidedAt: number | null
  voidedBy: string | null
}

export type RoomSummary = {
  id: string
  code: string
  name: string
  hasPassword: boolean
  memberCount: number
  gameActive: boolean
}

export type Game = {
  id: string
  roomId: string
  scoreLimit: number
  status: GameStatus
  startedAt: number
  finishedAt: number | null
  winnerUserId: string | null
}
```

`shared/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

- [ ] **Step 5: Создать пакет `server`**

`server/package.json`:

```json
{
  "name": "server",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsup src/server.ts --format esm --target node22 --clean --external better-sqlite3 --external @node-rs/argon2",
    "start": "node dist/server.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@node-rs/argon2": "^2.0.0",
    "@score/shared": "workspace:*",
    "better-sqlite3": "^11.5.0",
    "fastify": "^5.1.0",
    "fastify-plugin": "^5.0.1"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.11",
    "@types/node": "^22.9.0",
    "tsup": "^8.3.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

`server/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "types": ["node"],
    "paths": {
      "@score/shared": ["../shared/src/index.ts"]
    }
  },
  "include": ["src", "test"]
}
```

`server/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: {
      '@score/shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
})
```

- [ ] **Step 6: Дописать `client/package.json` и алиас в Vite**

`client/package.json`:

```json
{
  "name": "client",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc --noEmit && vite build",
    "preview": "vite preview",
    "typecheck": "vue-tsc --noEmit"
  },
  "dependencies": {
    "@score/shared": "workspace:*",
    "vue": "^3.5.0"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^5.2.0",
    "sass": "^1.81.0",
    "typescript": "^5.6.0",
    "vite": "^6.0.0",
    "vue-tsc": "^2.1.0"
  }
}
```

`client/vite.config.ts`:

```ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@score/shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)),
    },
  },
  build: { outDir: 'dist' },
})
```

`client/tsconfig.json` — переехавший файл нужно дополнить тем же алиасом, иначе `vue-tsc` не найдёт `@score/shared`. Добавить в `compilerOptions`:

```json
    "paths": {
      "@score/shared": ["../shared/src/index.ts"]
    }
```

- [ ] **Step 7: Установить зависимости и убедиться, что клиент собирается**

Run: `pnpm install && pnpm --filter client build`
Expected: сборка проходит, появляется `client/dist/index.html`

- [ ] **Step 8: Коммит**

```bash
git add -A
git commit -m "Перевести проект в pnpm-workspaces

Фронт переезжает в client/, добавлены пустые пакеты server/ и shared/."
```

---

## Task 2: Каркас Fastify и первый тест

**Files:**
- Create: `server/src/app.ts`, `server/src/server.ts`
- Test: `server/test/health.test.ts`

- [ ] **Step 1: Написать падающий тест**

`server/test/health.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildApp } from '../src/app.js'

describe('GET /api/health', () => {
  it('отвечает ok', async () => {
    const app = buildApp()
    await app.ready()

    const res = await app.inject({ method: 'GET', url: '/api/health' })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ status: 'ok' })
    await app.close()
  })
})
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `pnpm --filter server test`
Expected: FAIL — `Failed to resolve import "../src/app.js"`

- [ ] **Step 3: Написать минимальную реализацию**

`server/src/app.ts`:

```ts
import Fastify, { type FastifyInstance } from 'fastify'

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false })

  app.get('/api/health', async () => ({ status: 'ok' }))

  return app
}
```

`server/src/server.ts`:

```ts
import { buildApp } from './app.js'

const port = Number(process.env.PORT ?? 3000)
const app = buildApp()

app.listen({ port, host: '0.0.0.0' }).catch((err) => {
  console.error(err)
  process.exit(1)
})
```

- [ ] **Step 4: Запустить тест и убедиться, что он проходит**

Run: `pnpm --filter server test`
Expected: PASS, 1 тест

- [ ] **Step 5: Коммит**

```bash
git add server/src/app.ts server/src/server.ts server/test/health.test.ts
git commit -m "Добавить каркас Fastify с проверкой живости"
```

---

## Task 3: Схема базы и её открытие

**Files:**
- Create: `server/src/db/schema.ts`, `server/src/db/index.ts`
- Test: `server/test/db.test.ts`

- [ ] **Step 1: Написать падающий тест**

`server/test/db.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { openDb } from '../src/db/index.js'

describe('openDb', () => {
  it('создаёт все таблицы схемы', () => {
    const db = openDb(':memory:')

    const names = db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`)
      .all()
      .map((row) => (row as { name: string }).name)

    expect(names).toEqual(
      expect.arrayContaining([
        'users',
        'sessions',
        'rooms',
        'room_members',
        'games',
        'game_players',
        'score_entries',
        'room_events',
      ]),
    )
    db.close()
  })

  it('включает проверку внешних ключей', () => {
    const db = openDb(':memory:')

    expect(db.pragma('foreign_keys', { simple: true })).toBe(1)

    db.close()
  })

  it('выдаёт score_entries.seq возрастающими значениями', () => {
    const db = openDb(':memory:')
    db.prepare(`INSERT INTO users (id, nickname, created_at) VALUES ('u1', 'Аня', 0)`).run()
    db.prepare(`INSERT INTO rooms (id, code, name, host_user_id, created_at)
                VALUES ('r1', 'ABCDEF', 'Комната', 'u1', 0)`).run()
    db.prepare(`INSERT INTO games (id, room_id, score_limit, status, started_at)
                VALUES ('g1', 'r1', 100, 'active', 0)`).run()

    const insert = db.prepare(
      `INSERT INTO score_entries (id, game_id, user_id, points, created_by, created_at)
       VALUES (?, 'g1', 'u1', 10, 'u1', 0)`,
    )
    const first = insert.run('e1').lastInsertRowid
    const second = insert.run('e2').lastInsertRowid

    expect(Number(second)).toBeGreaterThan(Number(first))
    db.close()
  })
})
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `pnpm --filter server test db`
Expected: FAIL — `Failed to resolve import "../src/db/index.js"`

- [ ] **Step 3: Написать схему**

`server/src/db/schema.ts`:

```ts
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  nickname      TEXT NOT NULL,
  email         TEXT UNIQUE,
  password_hash TEXT,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash   TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id),
  created_at   INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS rooms (
  id            TEXT PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT,
  host_user_id  TEXT NOT NULL REFERENCES users(id),
  created_at    INTEGER NOT NULL,
  closed_at     INTEGER
);

CREATE TABLE IF NOT EXISTS room_members (
  room_id   TEXT NOT NULL REFERENCES rooms(id),
  user_id   TEXT NOT NULL REFERENCES users(id),
  joined_at INTEGER NOT NULL,
  left_at   INTEGER,
  PRIMARY KEY (room_id, user_id)
);

CREATE TABLE IF NOT EXISTS games (
  id             TEXT PRIMARY KEY,
  room_id        TEXT NOT NULL REFERENCES rooms(id),
  score_limit    INTEGER NOT NULL,
  status         TEXT NOT NULL CHECK (status IN ('active', 'finished', 'abandoned')),
  started_at     INTEGER NOT NULL,
  finished_at    INTEGER,
  winner_user_id TEXT REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_games_room ON games(room_id, started_at);

CREATE TABLE IF NOT EXISTS game_players (
  game_id TEXT NOT NULL REFERENCES games(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  seat    INTEGER NOT NULL,
  PRIMARY KEY (game_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_game_players_user ON game_players(user_id);

CREATE TABLE IF NOT EXISTS score_entries (
  seq        INTEGER PRIMARY KEY AUTOINCREMENT,
  id         TEXT NOT NULL UNIQUE,
  game_id    TEXT NOT NULL REFERENCES games(id),
  user_id    TEXT NOT NULL REFERENCES users(id),
  points     INTEGER NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  voided_at  INTEGER,
  voided_by  TEXT REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_entries_game ON score_entries(game_id, seq);

CREATE TABLE IF NOT EXISTS room_events (
  seq        INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id    TEXT NOT NULL REFERENCES rooms(id),
  type       TEXT NOT NULL,
  payload    TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_room_events_room_seq ON room_events(room_id, seq);
`
```

`server/src/db/index.ts`:

```ts
import Database from 'better-sqlite3'
import { SCHEMA_SQL } from './schema.js'

export type Db = Database.Database

export function openDb(path: string): Db {
  const db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(SCHEMA_SQL)
  return db
}
```

- [ ] **Step 4: Запустить тест и убедиться, что он проходит**

Run: `pnpm --filter server test db`
Expected: PASS, 3 теста

- [ ] **Step 5: Коммит**

```bash
git add server/src/db server/test/db.test.ts
git commit -m "Добавить схему SQLite и открытие базы"
```

---

## Task 4: Подсчёт счёта по журналу

**Files:**
- Create: `server/src/domain/score.ts`
- Test: `server/test/domain/score.test.ts`

- [ ] **Step 1: Написать падающие тесты**

`server/test/domain/score.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import type { ScoreEntry } from '@score/shared'
import { totalForPlayer, scoreboard } from '../../src/domain/score.js'

function entry(over: Partial<ScoreEntry> & { seq: number; userId: string; points: number }): ScoreEntry {
  return {
    id: `e${over.seq}`,
    gameId: 'g1',
    createdBy: over.userId,
    createdAt: over.seq * 1000,
    voidedAt: null,
    voidedBy: null,
    ...over,
  }
}

describe('totalForPlayer', () => {
  it('складывает очки одного игрока и игнорирует чужие', () => {
    const entries = [
      entry({ seq: 1, userId: 'anya', points: 10 }),
      entry({ seq: 2, userId: 'boris', points: 30 }),
      entry({ seq: 3, userId: 'anya', points: 5 }),
    ]

    expect(totalForPlayer(entries, 'anya')).toBe(15)
  })

  it('не учитывает отменённые записи', () => {
    const entries = [
      entry({ seq: 1, userId: 'anya', points: 10 }),
      entry({ seq: 2, userId: 'anya', points: 40, voidedAt: 9999, voidedBy: 'anya' }),
    ]

    expect(totalForPlayer(entries, 'anya')).toBe(10)
  })

  it('складывает отрицательные очки', () => {
    const entries = [
      entry({ seq: 1, userId: 'anya', points: 10 }),
      entry({ seq: 2, userId: 'anya', points: -4 }),
    ]

    expect(totalForPlayer(entries, 'anya')).toBe(6)
  })

  it('даёт ноль игроку без записей', () => {
    expect(totalForPlayer([], 'anya')).toBe(0)
  })
})

describe('scoreboard', () => {
  it('возвращает по строке на каждого игрока состава, включая пустых', () => {
    const entries = [
      entry({ seq: 1, userId: 'anya', points: 10 }),
      entry({ seq: 2, userId: 'boris', points: 30 }),
    ]

    expect(scoreboard(entries, ['anya', 'boris', 'vera'])).toEqual({
      anya: 10,
      boris: 30,
      vera: 0,
    })
  })

  it('игнорирует записи игроков вне состава', () => {
    const entries = [
      entry({ seq: 1, userId: 'anya', points: 10 }),
      entry({ seq: 2, userId: 'chužoj', points: 999 }),
    ]

    expect(scoreboard(entries, ['anya'])).toEqual({ anya: 10 })
  })
})
```

- [ ] **Step 2: Запустить тесты и убедиться, что они падают**

Run: `pnpm --filter server test score`
Expected: FAIL — `Failed to resolve import "../../src/domain/score.js"`

- [ ] **Step 3: Написать реализацию**

`server/src/domain/score.ts`:

```ts
import type { ScoreEntry } from '@score/shared'

/** Учитываются только неотменённые записи — отмена не удаляет строку, а гасит её вклад. */
export function totalForPlayer(entries: ScoreEntry[], userId: string): number {
  let total = 0
  for (const entry of entries) {
    if (entry.userId === userId && entry.voidedAt === null) {
      total += entry.points
    }
  }
  return total
}

export function scoreboard(entries: ScoreEntry[], playerIds: string[]): Record<string, number> {
  const totals: Record<string, number> = {}
  for (const id of playerIds) {
    totals[id] = 0
  }
  for (const entry of entries) {
    if (entry.voidedAt !== null) continue
    if (!(entry.userId in totals)) continue
    totals[entry.userId] += entry.points
  }
  return totals
}
```

- [ ] **Step 4: Запустить тесты и убедиться, что они проходят**

Run: `pnpm --filter server test score`
Expected: PASS, 6 тестов

- [ ] **Step 5: Коммит**

```bash
git add server/src/domain/score.ts server/test/domain/score.test.ts
git commit -m "Добавить подсчёт счёта по журналу записей"
```

---

## Task 5: Определение победителя

**Files:**
- Create: `server/src/domain/victory.ts`
- Test: `server/test/domain/victory.test.ts`

Правило: победитель — тот, кто первым перешёл лимит. Записи проигрываются в порядке `seq`, поэтому при одновременном переходе выигрывает меньший `seq`, а отмена записи задним числом корректно меняет исход.

- [ ] **Step 1: Написать падающие тесты**

`server/test/domain/victory.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import type { ScoreEntry } from '@score/shared'
import { findWinner } from '../../src/domain/victory.js'

function entry(over: Partial<ScoreEntry> & { seq: number; userId: string; points: number }): ScoreEntry {
  return {
    id: `e${over.seq}`,
    gameId: 'g1',
    createdBy: over.userId,
    createdAt: over.seq * 1000,
    voidedAt: null,
    voidedBy: null,
    ...over,
  }
}

const players = ['anya', 'boris']

describe('findWinner', () => {
  it('возвращает null, пока лимит не достигнут', () => {
    const entries = [entry({ seq: 1, userId: 'anya', points: 40 })]

    expect(findWinner(entries, players, 100)).toBeNull()
  })

  it('находит игрока, набравшего ровно лимит', () => {
    const entries = [
      entry({ seq: 1, userId: 'anya', points: 60 }),
      entry({ seq: 2, userId: 'anya', points: 40 }),
    ]

    expect(findWinner(entries, players, 100)).toBe('anya')
  })

  it('находит игрока, перешагнувшего лимит', () => {
    const entries = [entry({ seq: 1, userId: 'boris', points: 150 })]

    expect(findWinner(entries, players, 100)).toBe('boris')
  })

  it('при почти одновременном переходе выигрывает меньший seq', () => {
    const entries = [
      entry({ seq: 1, userId: 'anya', points: 90 }),
      entry({ seq: 2, userId: 'boris', points: 90 }),
      entry({ seq: 3, userId: 'boris', points: 20 }),
      entry({ seq: 4, userId: 'anya', points: 20 }),
    ]

    expect(findWinner(entries, players, 100)).toBe('boris')
  })

  it('не считает победой отменённую запись', () => {
    const entries = [
      entry({ seq: 1, userId: 'anya', points: 90 }),
      entry({ seq: 2, userId: 'anya', points: 20, voidedAt: 5000, voidedBy: 'anya' }),
    ]

    expect(findWinner(entries, players, 100)).toBeNull()
  })

  it('после отмены победа переходит другому игроку', () => {
    const entries = [
      entry({ seq: 1, userId: 'anya', points: 100, voidedAt: 5000, voidedBy: 'anya' }),
      entry({ seq: 2, userId: 'boris', points: 100 }),
    ]

    expect(findWinner(entries, players, 100)).toBe('boris')
  })

  it('игнорирует записи игроков вне состава', () => {
    const entries = [entry({ seq: 1, userId: 'chužoj', points: 500 })]

    expect(findWinner(entries, players, 100)).toBeNull()
  })

  it('разбирает записи в порядке seq, а не в порядке массива', () => {
    const entries = [
      entry({ seq: 3, userId: 'anya', points: 20 }),
      entry({ seq: 1, userId: 'anya', points: 90 }),
      entry({ seq: 2, userId: 'boris', points: 110 }),
    ]

    expect(findWinner(entries, players, 100)).toBe('boris')
  })
})
```

- [ ] **Step 2: Запустить тесты и убедиться, что они падают**

Run: `pnpm --filter server test victory`
Expected: FAIL — `Failed to resolve import "../../src/domain/victory.js"`

- [ ] **Step 3: Написать реализацию**

`server/src/domain/victory.ts`:

```ts
import type { ScoreEntry } from '@score/shared'

/**
 * Проигрывает журнал в порядке seq и возвращает первого игрока,
 * чей накопленный счёт достиг лимита. Отменённые записи пропускаются,
 * поэтому отмена задним числом корректно меняет исход.
 */
export function findWinner(
  entries: ScoreEntry[],
  playerIds: string[],
  scoreLimit: number,
): string | null {
  const totals: Record<string, number> = {}
  for (const id of playerIds) {
    totals[id] = 0
  }

  const ordered = entries
    .filter((entry) => entry.voidedAt === null)
    .sort((a, b) => a.seq - b.seq)

  for (const entry of ordered) {
    if (!(entry.userId in totals)) continue
    totals[entry.userId] += entry.points
    if (totals[entry.userId] >= scoreLimit) {
      return entry.userId
    }
  }

  return null
}
```

- [ ] **Step 4: Запустить тесты и убедиться, что они проходят**

Run: `pnpm --filter server test victory`
Expected: PASS, 8 тестов

- [ ] **Step 5: Коммит**

```bash
git add server/src/domain/victory.ts server/test/domain/victory.test.ts
git commit -m "Добавить определение победителя по журналу"
```

---

## Task 6: Права участников

**Files:**
- Create: `server/src/domain/permissions.ts`
- Test: `server/test/domain/permissions.test.ts`

- [ ] **Step 1: Написать падающие тесты**

`server/test/domain/permissions.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  canAddEntryFor,
  canVoidEntry,
  canStartGame,
  type PermissionContext,
} from '../../src/domain/permissions.js'

const ctx: PermissionContext = {
  actorId: 'anya',
  hostId: 'anya',
  playerIds: ['anya', 'boris'],
}

const asBoris: PermissionContext = { ...ctx, actorId: 'boris' }
const asStranger: PermissionContext = { ...ctx, actorId: 'chužoj' }

describe('canAddEntryFor', () => {
  it('разрешает записывать очки себе', () => {
    expect(canAddEntryFor(asBoris, 'boris')).toBe(true)
  })

  it('запрещает обычному игроку записывать очки другому', () => {
    expect(canAddEntryFor(asBoris, 'anya')).toBe(false)
  })

  it('разрешает хосту записывать очки другому', () => {
    expect(canAddEntryFor(ctx, 'boris')).toBe(true)
  })

  it('запрещает тому, кто не в составе игры', () => {
    expect(canAddEntryFor(asStranger, 'chužoj')).toBe(false)
  })

  it('запрещает запись очков тому, кого нет в составе', () => {
    expect(canAddEntryFor(ctx, 'chužoj')).toBe(false)
  })
})

describe('canVoidEntry', () => {
  it('разрешает отменить свою запись', () => {
    expect(canVoidEntry(asBoris, 'boris')).toBe(true)
  })

  it('запрещает обычному игроку отменять чужую запись', () => {
    expect(canVoidEntry(asBoris, 'anya')).toBe(false)
  })

  it('разрешает хосту отменить чужую запись', () => {
    expect(canVoidEntry(ctx, 'boris')).toBe(true)
  })

  it('запрещает постороннему', () => {
    expect(canVoidEntry(asStranger, 'anya')).toBe(false)
  })
})

describe('canStartGame', () => {
  it('разрешает хосту', () => {
    expect(canStartGame(ctx)).toBe(true)
  })

  it('запрещает не-хосту', () => {
    expect(canStartGame(asBoris)).toBe(false)
  })
})
```

- [ ] **Step 2: Запустить тесты и убедиться, что они падают**

Run: `pnpm --filter server test permissions`
Expected: FAIL — `Failed to resolve import "../../src/domain/permissions.js"`

- [ ] **Step 3: Написать реализацию**

`server/src/domain/permissions.ts`:

```ts
export type PermissionContext = {
  /** Кто выполняет действие. */
  actorId: string
  /** Текущий хост комнаты. */
  hostId: string
  /** Состав игры, зафиксированный на старте. */
  playerIds: string[]
}

/** Действовать может только участник состава: себе — всегда, другому — если он хост. */
function actorMayTouch(ctx: PermissionContext, targetUserId: string): boolean {
  if (!ctx.playerIds.includes(ctx.actorId)) return false
  if (!ctx.playerIds.includes(targetUserId)) return false
  return ctx.actorId === targetUserId || ctx.actorId === ctx.hostId
}

export function canAddEntryFor(ctx: PermissionContext, targetUserId: string): boolean {
  return actorMayTouch(ctx, targetUserId)
}

export function canVoidEntry(ctx: PermissionContext, entryOwnerId: string): boolean {
  return actorMayTouch(ctx, entryOwnerId)
}

export function canStartGame(ctx: PermissionContext): boolean {
  return ctx.actorId === ctx.hostId
}
```

- [ ] **Step 4: Запустить тесты и убедиться, что они проходят**

Run: `pnpm --filter server test permissions`
Expected: PASS, 11 тестов

- [ ] **Step 5: Коммит**

```bash
git add server/src/domain/permissions.ts server/test/domain/permissions.test.ts
git commit -m "Добавить правила доступа к записи и отмене очков"
```

---

## Task 7: Гостевая аутентификация

**Files:**
- Create: `server/src/auth/tokens.ts`, `server/src/repo/users.ts`, `server/src/repo/sessions.ts`, `server/src/plugins/auth.ts`, `server/src/routes/auth.ts`, `server/test/helpers.ts`
- Modify: `server/src/app.ts`, `server/src/server.ts`
- Test: `server/test/auth.test.ts`

- [ ] **Step 1: Написать вспомогательный модуль для тестов**

`server/test/helpers.ts`:

```ts
import type { FastifyInstance } from 'fastify'
import type { PublicUser } from '@score/shared'
import { openDb, type Db } from '../src/db/index.js'
import { buildApp } from '../src/app.js'

export type TestApp = { app: FastifyInstance; db: Db }

export async function makeApp(): Promise<TestApp> {
  const db = openDb(':memory:')
  const app = buildApp(db)
  await app.ready()
  return { app, db }
}

export async function closeApp({ app, db }: TestApp): Promise<void> {
  await app.close()
  db.close()
}

export type Guest = { token: string; user: PublicUser }

export async function createGuestSession(app: FastifyInstance, nickname: string): Promise<Guest> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/guest',
    payload: { nickname },
  })
  if (res.statusCode !== 200) {
    throw new Error(`не удалось создать гостя: ${res.statusCode} ${res.body}`)
  }
  return res.json() as Guest
}

export function bearer(guest: Guest): Record<string, string> {
  return { authorization: `Bearer ${guest.token}` }
}
```

- [ ] **Step 2: Написать падающие тесты**

`server/test/auth.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { makeApp, closeApp, createGuestSession, bearer, type TestApp } from './helpers.js'

let ctx: TestApp

beforeEach(async () => {
  ctx = await makeApp()
})

afterEach(async () => {
  await closeApp(ctx)
})

describe('POST /api/auth/guest', () => {
  it('заводит гостя и выдаёт токен', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/guest',
      payload: { nickname: 'Аня' },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.token).toEqual(expect.any(String))
    expect(body.user).toEqual({
      id: expect.any(String),
      nickname: 'Аня',
      hasEmail: false,
    })
  })

  it('отклоняет пустой ник', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/guest',
      payload: { nickname: '' },
    })

    expect(res.statusCode).toBe(400)
  })

  it('отклоняет ник длиннее 20 символов', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/guest',
      payload: { nickname: 'я'.repeat(21) },
    })

    expect(res.statusCode).toBe(400)
  })

  it('не хранит сырой токен в базе', async () => {
    const guest = await createGuestSession(ctx.app, 'Аня')

    const row = ctx.db
      .prepare('SELECT token_hash FROM sessions')
      .get() as { token_hash: string }

    expect(row.token_hash).not.toBe(guest.token)
  })
})

describe('GET /api/me', () => {
  it('возвращает текущего пользователя по токену', async () => {
    const guest = await createGuestSession(ctx.app, 'Аня')

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/me',
      headers: bearer(guest),
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual(guest.user)
  })

  it('отвечает 401 без токена', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/me' })

    expect(res.statusCode).toBe(401)
  })

  it('отвечает 401 на неизвестный токен', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { authorization: 'Bearer выдуманный' },
    })

    expect(res.statusCode).toBe(401)
  })
})
```

- [ ] **Step 3: Запустить тесты и убедиться, что они падают**

Run: `pnpm --filter server test auth`
Expected: FAIL — `buildApp` не принимает аргументов, маршрутов нет

- [ ] **Step 4: Написать работу с токенами**

`server/src/auth/tokens.ts`:

```ts
import { randomBytes, createHash } from 'node:crypto'

export function createToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}
```

- [ ] **Step 5: Написать репозитории пользователей и сессий**

`server/src/repo/users.ts`:

```ts
import { randomUUID } from 'node:crypto'
import type { PublicUser } from '@score/shared'
import type { Db } from '../db/index.js'

export type UserRow = {
  id: string
  nickname: string
  email: string | null
  password_hash: string | null
  created_at: number
}

export function toPublicUser(row: UserRow): PublicUser {
  return { id: row.id, nickname: row.nickname, hasEmail: row.email !== null }
}

export function createGuest(db: Db, nickname: string): UserRow {
  const row: UserRow = {
    id: randomUUID(),
    nickname,
    email: null,
    password_hash: null,
    created_at: Date.now(),
  }
  db.prepare(
    `INSERT INTO users (id, nickname, email, password_hash, created_at)
     VALUES (@id, @nickname, @email, @password_hash, @created_at)`,
  ).run(row)
  return row
}

export function findUserById(db: Db, id: string): UserRow | null {
  return (db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined) ?? null
}

export function findUserByEmail(db: Db, email: string): UserRow | null {
  return (
    (db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined) ?? null
  )
}

export function attachEmail(db: Db, userId: string, email: string, passwordHash: string): void {
  db.prepare('UPDATE users SET email = ?, password_hash = ? WHERE id = ?').run(
    email,
    passwordHash,
    userId,
  )
}
```

`server/src/repo/sessions.ts`:

```ts
import type { Db } from '../db/index.js'
import { createToken, hashToken } from '../auth/tokens.js'
import { type UserRow } from './users.js'

/** Возвращает сырой токен — в базу уходит только его хэш. */
export function createSession(db: Db, userId: string): string {
  const token = createToken()
  const now = Date.now()
  db.prepare(
    `INSERT INTO sessions (token_hash, user_id, created_at, last_seen_at)
     VALUES (?, ?, ?, ?)`,
  ).run(hashToken(token), userId, now, now)
  return token
}

export function findUserByToken(db: Db, token: string): UserRow | null {
  const row = db
    .prepare(
      `SELECT users.* FROM sessions
       JOIN users ON users.id = sessions.user_id
       WHERE sessions.token_hash = ?`,
    )
    .get(hashToken(token)) as UserRow | undefined
  return row ?? null
}
```

- [ ] **Step 6: Написать плагин аутентификации**

`server/src/plugins/auth.ts`:

```ts
import fp from 'fastify-plugin'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { findUserByToken } from '../repo/sessions.js'
import type { UserRow } from '../repo/users.js'
import type { Db } from '../db/index.js'

declare module 'fastify' {
  interface FastifyInstance {
    db: Db
    requireAuth: (req: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
  interface FastifyRequest {
    currentUser: UserRow | null
  }
}

export default fp(async (app) => {
  app.decorateRequest('currentUser', null)

  app.addHook('onRequest', async (req) => {
    const header = req.headers.authorization
    if (!header?.startsWith('Bearer ')) return
    req.currentUser = findUserByToken(app.db, header.slice('Bearer '.length))
  })

  app.decorate('requireAuth', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.currentUser) {
      await reply.code(401).send({ error: 'unauthorized' })
    }
  })
})
```

- [ ] **Step 7: Написать маршруты аутентификации**

`server/src/routes/auth.ts`:

```ts
import type { FastifyInstance } from 'fastify'
import { createGuest, toPublicUser } from '../repo/users.js'
import { createSession } from '../repo/sessions.js'

const guestSchema = {
  body: {
    type: 'object',
    required: ['nickname'],
    additionalProperties: false,
    properties: {
      nickname: { type: 'string', minLength: 1, maxLength: 20 },
    },
  },
}

export default async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: { nickname: string } }>(
    '/auth/guest',
    { schema: guestSchema },
    async (req) => {
      const user = createGuest(app.db, req.body.nickname.trim())
      const token = createSession(app.db, user.id)
      return { token, user: toPublicUser(user) }
    },
  )

  app.get('/me', { preHandler: app.requireAuth }, async (req) => {
    return toPublicUser(req.currentUser!)
  })
}
```

- [ ] **Step 8: Переписать сборку приложения**

`server/src/app.ts`:

```ts
import Fastify, { type FastifyInstance } from 'fastify'
import type { Db } from './db/index.js'
import authPlugin from './plugins/auth.js'
import authRoutes from './routes/auth.js'

export function buildApp(db: Db): FastifyInstance {
  const app = Fastify({ logger: false })

  app.decorate('db', db)
  app.register(authPlugin)

  app.get('/api/health', async () => ({ status: 'ok' }))
  app.register(authRoutes, { prefix: '/api' })

  return app
}
```

`server/src/server.ts`:

```ts
import { openDb } from './db/index.js'
import { buildApp } from './app.js'

const port = Number(process.env.PORT ?? 3000)
const dbPath = process.env.DB_PATH ?? './score.db'

const db = openDb(dbPath)
const app = buildApp(db)

app.listen({ port, host: '0.0.0.0' }).catch((err) => {
  console.error(err)
  process.exit(1)
})
```

`server/test/health.test.ts` — обновить под новую сигнатуру:

```ts
import { describe, it, expect } from 'vitest'
import { makeApp, closeApp } from './helpers.js'

describe('GET /api/health', () => {
  it('отвечает ok', async () => {
    const ctx = await makeApp()

    const res = await ctx.app.inject({ method: 'GET', url: '/api/health' })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ status: 'ok' })
    await closeApp(ctx)
  })
})
```

- [ ] **Step 9: Запустить все тесты и убедиться, что они проходят**

Run: `pnpm --filter server test`
Expected: PASS — 7 тестов аутентификации плюс ранее написанные

- [ ] **Step 10: Коммит**

```bash
git add server/src server/test
git commit -m "Добавить гостевую аутентификацию по токену сессии"
```

---

## Task 8: Привязка email и вход по паролю

**Files:**
- Create: `server/src/auth/passwords.ts`
- Modify: `server/src/routes/auth.ts`
- Test: `server/test/auth-email.test.ts`

- [ ] **Step 1: Написать падающие тесты**

`server/test/auth-email.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { makeApp, closeApp, createGuestSession, bearer, type TestApp } from './helpers.js'

let ctx: TestApp

beforeEach(async () => {
  ctx = await makeApp()
})

afterEach(async () => {
  await closeApp(ctx)
})

describe('POST /api/auth/upgrade', () => {
  it('привязывает email к текущему гостю, сохраняя его id', async () => {
    const guest = await createGuestSession(ctx.app, 'Аня')

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/upgrade',
      headers: bearer(guest),
      payload: { email: 'anya@example.com', password: 'очень-секретно' },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({
      id: guest.user.id,
      nickname: 'Аня',
      hasEmail: true,
    })
  })

  it('не хранит пароль в открытом виде', async () => {
    const guest = await createGuestSession(ctx.app, 'Аня')
    await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/upgrade',
      headers: bearer(guest),
      payload: { email: 'anya@example.com', password: 'очень-секретно' },
    })

    const row = ctx.db
      .prepare('SELECT password_hash FROM users WHERE id = ?')
      .get(guest.user.id) as { password_hash: string }

    expect(row.password_hash).not.toContain('очень-секретно')
    expect(row.password_hash.startsWith('$argon2')).toBe(true)
  })

  it('отклоняет занятый email', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')
    await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/upgrade',
      headers: bearer(anya),
      payload: { email: 'anya@example.com', password: 'очень-секретно' },
    })
    const boris = await createGuestSession(ctx.app, 'Борис')

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/upgrade',
      headers: bearer(boris),
      payload: { email: 'anya@example.com', password: 'другой-пароль' },
    })

    expect(res.statusCode).toBe(409)
  })

  it('отклоняет короткий пароль', async () => {
    const guest = await createGuestSession(ctx.app, 'Аня')

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/upgrade',
      headers: bearer(guest),
      payload: { email: 'anya@example.com', password: 'корот' },
    })

    expect(res.statusCode).toBe(400)
  })

  it('требует авторизации', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/upgrade',
      payload: { email: 'anya@example.com', password: 'очень-секретно' },
    })

    expect(res.statusCode).toBe(401)
  })
})

describe('POST /api/auth/login', () => {
  it('выдаёт новый токен для того же пользователя', async () => {
    const guest = await createGuestSession(ctx.app, 'Аня')
    await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/upgrade',
      headers: bearer(guest),
      payload: { email: 'anya@example.com', password: 'очень-секретно' },
    })

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'anya@example.com', password: 'очень-секретно' },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.user.id).toBe(guest.user.id)
    expect(body.token).not.toBe(guest.token)
  })

  it('отклоняет неверный пароль', async () => {
    const guest = await createGuestSession(ctx.app, 'Аня')
    await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/upgrade',
      headers: bearer(guest),
      payload: { email: 'anya@example.com', password: 'очень-секретно' },
    })

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'anya@example.com', password: 'неправильный' },
    })

    expect(res.statusCode).toBe(401)
  })

  it('отклоняет неизвестный email', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'никого@example.com', password: 'очень-секретно' },
    })

    expect(res.statusCode).toBe(401)
  })
})
```

- [ ] **Step 2: Запустить тесты и убедиться, что они падают**

Run: `pnpm --filter server test auth-email`
Expected: FAIL — 404 вместо ожидаемых кодов, маршрутов нет

- [ ] **Step 3: Написать обёртку над argon2**

`server/src/auth/passwords.ts`:

```ts
import { hash, verify } from '@node-rs/argon2'

export function hashPassword(password: string): Promise<string> {
  return hash(password)
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password)
  } catch {
    return false
  }
}
```

- [ ] **Step 4: Дописать маршруты**

`server/src/routes/auth.ts` — полное содержимое файла после изменения:

```ts
import type { FastifyInstance } from 'fastify'
import {
  createGuest,
  toPublicUser,
  findUserByEmail,
  attachEmail,
} from '../repo/users.js'
import { createSession } from '../repo/sessions.js'
import { hashPassword, verifyPassword } from '../auth/passwords.js'

const guestSchema = {
  body: {
    type: 'object',
    required: ['nickname'],
    additionalProperties: false,
    properties: {
      nickname: { type: 'string', minLength: 1, maxLength: 20 },
    },
  },
}

const credentialsSchema = {
  body: {
    type: 'object',
    required: ['email', 'password'],
    additionalProperties: false,
    properties: {
      email: { type: 'string', format: 'email', maxLength: 200 },
      password: { type: 'string', minLength: 8, maxLength: 200 },
    },
  },
}

type Credentials = { email: string; password: string }

export default async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: { nickname: string } }>(
    '/auth/guest',
    { schema: guestSchema },
    async (req) => {
      const user = createGuest(app.db, req.body.nickname.trim())
      const token = createSession(app.db, user.id)
      return { token, user: toPublicUser(user) }
    },
  )

  app.post<{ Body: Credentials }>(
    '/auth/upgrade',
    { schema: credentialsSchema, preHandler: app.requireAuth },
    async (req, reply) => {
      const email = req.body.email.toLowerCase()
      const existing = findUserByEmail(app.db, email)
      if (existing) {
        return reply.code(409).send({ error: 'email_taken' })
      }

      const user = req.currentUser!
      attachEmail(app.db, user.id, email, await hashPassword(req.body.password))
      return toPublicUser({ ...user, email })
    },
  )

  app.post<{ Body: Credentials }>(
    '/auth/login',
    { schema: credentialsSchema },
    async (req, reply) => {
      const user = findUserByEmail(app.db, req.body.email.toLowerCase())
      if (!user?.password_hash) {
        return reply.code(401).send({ error: 'invalid_credentials' })
      }
      if (!(await verifyPassword(user.password_hash, req.body.password))) {
        return reply.code(401).send({ error: 'invalid_credentials' })
      }

      return { token: createSession(app.db, user.id), user: toPublicUser(user) }
    },
  )

  app.get('/me', { preHandler: app.requireAuth }, async (req) => {
    return toPublicUser(req.currentUser!)
  })
}
```

`format: 'email'` требует пакета `@fastify/ajv-compiler` с форматами. Проще подключить `ajv-formats` в `buildApp`:

`server/src/app.ts` — заменить создание экземпляра:

```ts
import Fastify, { type FastifyInstance } from 'fastify'
import addFormats from 'ajv-formats'
import type { Db } from './db/index.js'
import authPlugin from './plugins/auth.js'
import authRoutes from './routes/auth.js'

export function buildApp(db: Db): FastifyInstance {
  const app = Fastify({
    logger: false,
    ajv: { plugins: [addFormats] },
  })

  app.decorate('db', db)
  app.register(authPlugin)

  app.get('/api/health', async () => ({ status: 'ok' }))
  app.register(authRoutes, { prefix: '/api' })

  return app
}
```

Run: `pnpm --filter server add ajv-formats`

- [ ] **Step 5: Запустить тесты и убедиться, что они проходят**

Run: `pnpm --filter server test auth-email`
Expected: PASS, 8 тестов

- [ ] **Step 6: Коммит**

```bash
git add server/src server/test/auth-email.test.ts
git commit -m "Добавить привязку email и вход по паролю"
```

---

## Task 9: Создание комнаты и лобби

**Files:**
- Create: `server/src/domain/code.ts`, `server/src/repo/rooms.ts`, `server/src/routes/rooms.ts`
- Modify: `server/src/app.ts`
- Test: `server/test/domain/code.test.ts`, `server/test/rooms.test.ts`

- [ ] **Step 1: Написать падающий тест генератора кода**

`server/test/domain/code.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { generateRoomCode, ROOM_CODE_ALPHABET } from '../../src/domain/code.js'

describe('generateRoomCode', () => {
  it('возвращает шесть символов', () => {
    expect(generateRoomCode()).toHaveLength(6)
  })

  it('использует только символы алфавита без похожих знаков', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateRoomCode()).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/)
    }
  })

  it('не содержит легко путаемых символов', () => {
    expect(ROOM_CODE_ALPHABET).not.toContain('O')
    expect(ROOM_CODE_ALPHABET).not.toContain('0')
    expect(ROOM_CODE_ALPHABET).not.toContain('I')
    expect(ROOM_CODE_ALPHABET).not.toContain('1')
  })

  it('берёт символы из переданного источника случайности', () => {
    const code = generateRoomCode(() => 0)

    expect(code).toBe(ROOM_CODE_ALPHABET[0].repeat(6))
  })
})
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `pnpm --filter server test code`
Expected: FAIL — `Failed to resolve import "../../src/domain/code.js"`

- [ ] **Step 3: Написать генератор**

`server/src/domain/code.ts`:

```ts
import { randomInt } from 'node:crypto'

/** Без O/0 и I/1 — код диктуют голосом и вводят с телефона. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export const ROOM_CODE_LENGTH = 6

export function generateRoomCode(pick: (max: number) => number = randomInt): string {
  let code = ''
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET[pick(ROOM_CODE_ALPHABET.length)]
  }
  return code
}
```

- [ ] **Step 4: Запустить тест и убедиться, что он проходит**

Run: `pnpm --filter server test code`
Expected: PASS, 4 теста

- [ ] **Step 5: Написать падающие тесты комнат**

`server/test/rooms.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { makeApp, closeApp, createGuestSession, bearer, type TestApp } from './helpers.js'

let ctx: TestApp

beforeEach(async () => {
  ctx = await makeApp()
})

afterEach(async () => {
  await closeApp(ctx)
})

describe('POST /api/rooms', () => {
  it('создаёт комнату и делает автора хостом и участником', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/rooms',
      headers: bearer(anya),
      payload: { name: 'Вечер преферанса' },
    })

    expect(res.statusCode).toBe(200)
    const room = res.json()
    expect(room).toEqual({
      id: expect.any(String),
      code: expect.stringMatching(/^[A-Z2-9]{6}$/),
      name: 'Вечер преферанса',
      hasPassword: false,
      memberCount: 1,
      gameActive: false,
    })

    const membership = ctx.db
      .prepare('SELECT user_id FROM room_members WHERE room_id = ?')
      .all(room.id)
    expect(membership).toEqual([{ user_id: anya.user.id }])
  })

  it('не возвращает пароль и хранит его хэшем', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/rooms',
      headers: bearer(anya),
      payload: { name: 'Закрытая', password: 'дружеский' },
    })

    expect(res.json().hasPassword).toBe(true)
    expect(res.body).not.toContain('дружеский')

    const row = ctx.db
      .prepare('SELECT password_hash FROM rooms WHERE id = ?')
      .get(res.json().id) as { password_hash: string }
    expect(row.password_hash.startsWith('$argon2')).toBe(true)
  })

  it('отклоняет пустое имя', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/rooms',
      headers: bearer(anya),
      payload: { name: '' },
    })

    expect(res.statusCode).toBe(400)
  })

  it('требует авторизации', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/rooms',
      payload: { name: 'Вечер преферанса' },
    })

    expect(res.statusCode).toBe(401)
  })
})

describe('GET /api/rooms', () => {
  it('показывает открытые комнаты с признаком пароля, но без него самого', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')
    await ctx.app.inject({
      method: 'POST',
      url: '/api/rooms',
      headers: bearer(anya),
      payload: { name: 'Открытая' },
    })
    await ctx.app.inject({
      method: 'POST',
      url: '/api/rooms',
      headers: bearer(anya),
      payload: { name: 'Закрытая', password: 'дружеский' },
    })

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/rooms',
      headers: bearer(anya),
    })

    expect(res.statusCode).toBe(200)
    const names = res.json().map((room: { name: string }) => room.name)
    expect(names).toEqual(expect.arrayContaining(['Открытая', 'Закрытая']))
    expect(res.body).not.toContain('дружеский')
  })

  it('не показывает закрытые комнаты', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')
    const created = await ctx.app.inject({
      method: 'POST',
      url: '/api/rooms',
      headers: bearer(anya),
      payload: { name: 'Вчерашняя' },
    })
    ctx.db
      .prepare('UPDATE rooms SET closed_at = ? WHERE id = ?')
      .run(Date.now(), created.json().id)

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/rooms',
      headers: bearer(anya),
    })

    expect(res.json()).toEqual([])
  })

  it('требует авторизации', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/rooms' })

    expect(res.statusCode).toBe(401)
  })
})
```

- [ ] **Step 6: Запустить тесты и убедиться, что они падают**

Run: `pnpm --filter server test rooms`
Expected: FAIL — 404, маршрутов нет

- [ ] **Step 7: Написать репозиторий комнат**

`server/src/repo/rooms.ts`:

```ts
import { randomUUID } from 'node:crypto'
import type { RoomSummary } from '@score/shared'
import type { Db } from '../db/index.js'
import { generateRoomCode } from '../domain/code.js'

export type RoomRow = {
  id: string
  code: string
  name: string
  password_hash: string | null
  host_user_id: string
  created_at: number
  closed_at: number | null
}

export type RoomWithCounts = RoomRow & { member_count: number; active_games: number }

export function toRoomSummary(row: RoomWithCounts): RoomSummary {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    hasPassword: row.password_hash !== null,
    memberCount: row.member_count,
    gameActive: row.active_games > 0,
  }
}

const SUMMARY_SELECT = `
  SELECT rooms.*,
         (SELECT COUNT(*) FROM room_members
           WHERE room_members.room_id = rooms.id AND room_members.left_at IS NULL) AS member_count,
         (SELECT COUNT(*) FROM games
           WHERE games.room_id = rooms.id AND games.status = 'active') AS active_games
  FROM rooms
`

export function createRoom(
  db: Db,
  name: string,
  passwordHash: string | null,
  hostUserId: string,
): RoomRow {
  const insert = db.prepare(
    `INSERT INTO rooms (id, code, name, password_hash, host_user_id, created_at)
     VALUES (@id, @code, @name, @password_hash, @host_user_id, @created_at)`,
  )

  // Коллизия шестизначного кода маловероятна, но UNIQUE её поймает — просто пробуем ещё раз.
  for (let attempt = 0; attempt < 10; attempt++) {
    const row: RoomRow = {
      id: randomUUID(),
      code: generateRoomCode(),
      name,
      password_hash: passwordHash,
      host_user_id: hostUserId,
      created_at: Date.now(),
      closed_at: null,
    }
    try {
      insert.run(row)
      return row
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      if (!message.includes('rooms.code')) throw err
    }
  }
  throw new Error('не удалось подобрать свободный код комнаты')
}

export function findRoomById(db: Db, id: string): RoomRow | null {
  return (db.prepare('SELECT * FROM rooms WHERE id = ?').get(id) as RoomRow | undefined) ?? null
}

export function findRoomSummary(db: Db, id: string): RoomWithCounts | null {
  return (
    (db.prepare(`${SUMMARY_SELECT} WHERE rooms.id = ?`).get(id) as RoomWithCounts | undefined) ??
    null
  )
}

export function listOpenRooms(db: Db): RoomWithCounts[] {
  return db
    .prepare(`${SUMMARY_SELECT} WHERE rooms.closed_at IS NULL ORDER BY rooms.created_at DESC`)
    .all() as RoomWithCounts[]
}

export function addMember(db: Db, roomId: string, userId: string): void {
  db.prepare(
    `INSERT INTO room_members (room_id, user_id, joined_at, left_at)
     VALUES (?, ?, ?, NULL)
     ON CONFLICT (room_id, user_id) DO UPDATE SET left_at = NULL`,
  ).run(roomId, userId, Date.now())
}

export function removeMember(db: Db, roomId: string, userId: string): void {
  db.prepare('UPDATE room_members SET left_at = ? WHERE room_id = ? AND user_id = ?').run(
    Date.now(),
    roomId,
    userId,
  )
}

export function listMemberIds(db: Db, roomId: string): string[] {
  return (
    db
      .prepare(
        `SELECT user_id FROM room_members
         WHERE room_id = ? AND left_at IS NULL
         ORDER BY joined_at`,
      )
      .all(roomId) as { user_id: string }[]
  ).map((row) => row.user_id)
}

export function isMember(db: Db, roomId: string, userId: string): boolean {
  const row = db
    .prepare('SELECT 1 FROM room_members WHERE room_id = ? AND user_id = ? AND left_at IS NULL')
    .get(roomId, userId)
  return row !== undefined
}
```

- [ ] **Step 8: Написать маршруты комнат**

`server/src/routes/rooms.ts`:

```ts
import type { FastifyInstance } from 'fastify'
import { hashPassword } from '../auth/passwords.js'
import {
  createRoom,
  addMember,
  listOpenRooms,
  findRoomSummary,
  toRoomSummary,
} from '../repo/rooms.js'

const createRoomSchema = {
  body: {
    type: 'object',
    required: ['name'],
    additionalProperties: false,
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 40 },
      password: { type: 'string', minLength: 1, maxLength: 100 },
    },
  },
}

export default async function roomRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: { name: string; password?: string } }>(
    '/rooms',
    { schema: createRoomSchema, preHandler: app.requireAuth },
    async (req) => {
      const host = req.currentUser!
      const passwordHash = req.body.password ? await hashPassword(req.body.password) : null

      const room = createRoom(app.db, req.body.name.trim(), passwordHash, host.id)
      addMember(app.db, room.id, host.id)

      return toRoomSummary(findRoomSummary(app.db, room.id)!)
    },
  )

  app.get('/rooms', { preHandler: app.requireAuth }, async () => {
    return listOpenRooms(app.db).map(toRoomSummary)
  })
}
```

- [ ] **Step 9: Подключить маршруты в `buildApp`**

`server/src/app.ts` — добавить импорт и регистрацию:

```ts
import roomRoutes from './routes/rooms.js'
```

и после `app.register(authRoutes, { prefix: '/api' })`:

```ts
  app.register(roomRoutes, { prefix: '/api' })
```

- [ ] **Step 10: Запустить тесты и убедиться, что они проходят**

Run: `pnpm --filter server test rooms`
Expected: PASS, 7 тестов

- [ ] **Step 11: Коммит**

```bash
git add server/src server/test
git commit -m "Добавить создание комнаты и список лобби"
```

---

## Task 10: Вход в комнату и выход из неё

**Files:**
- Modify: `server/src/routes/rooms.ts`
- Test: `server/test/rooms-join.test.ts`

- [ ] **Step 1: Написать падающие тесты**

`server/test/rooms-join.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import {
  makeApp,
  closeApp,
  createGuestSession,
  bearer,
  type TestApp,
  type Guest,
} from './helpers.js'

let ctx: TestApp

beforeEach(async () => {
  ctx = await makeApp()
})

afterEach(async () => {
  await closeApp(ctx)
})

async function createRoom(
  app: FastifyInstance,
  host: Guest,
  payload: { name: string; password?: string },
): Promise<{ id: string; code: string }> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/rooms',
    headers: bearer(host),
    payload,
  })
  return res.json()
}

describe('POST /api/rooms/:id/join', () => {
  it('пускает в комнату без пароля', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')
    const boris = await createGuestSession(ctx.app, 'Борис')
    const room = await createRoom(ctx.app, anya, { name: 'Открытая' })

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${room.id}/join`,
      headers: bearer(boris),
      payload: {},
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().memberCount).toBe(2)
  })

  it('пускает по верному паролю', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')
    const boris = await createGuestSession(ctx.app, 'Борис')
    const room = await createRoom(ctx.app, anya, { name: 'Закрытая', password: 'дружеский' })

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${room.id}/join`,
      headers: bearer(boris),
      payload: { password: 'дружеский' },
    })

    expect(res.statusCode).toBe(200)
  })

  it('отклоняет неверный пароль', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')
    const boris = await createGuestSession(ctx.app, 'Борис')
    const room = await createRoom(ctx.app, anya, { name: 'Закрытая', password: 'дружеский' })

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${room.id}/join`,
      headers: bearer(boris),
      payload: { password: 'подобранный' },
    })

    expect(res.statusCode).toBe(403)
  })

  it('отклоняет вход в защищённую комнату без пароля', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')
    const boris = await createGuestSession(ctx.app, 'Борис')
    const room = await createRoom(ctx.app, anya, { name: 'Закрытая', password: 'дружеский' })

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${room.id}/join`,
      headers: bearer(boris),
      payload: {},
    })

    expect(res.statusCode).toBe(403)
  })

  it('повторный вход не создаёт второго участника', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')
    const boris = await createGuestSession(ctx.app, 'Борис')
    const room = await createRoom(ctx.app, anya, { name: 'Открытая' })

    await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${room.id}/join`,
      headers: bearer(boris),
      payload: {},
    })
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${room.id}/join`,
      headers: bearer(boris),
      payload: {},
    })

    expect(res.json().memberCount).toBe(2)
  })

  it('отвечает 404 на несуществующую комнату', async () => {
    const boris = await createGuestSession(ctx.app, 'Борис')

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/rooms/нет-такой/join',
      headers: bearer(boris),
      payload: {},
    })

    expect(res.statusCode).toBe(404)
  })
})

describe('GET /api/rooms/by-code/:code', () => {
  it('находит комнату по коду для ссылки-приглашения', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')
    const boris = await createGuestSession(ctx.app, 'Борис')
    const room = await createRoom(ctx.app, anya, { name: 'Открытая' })

    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/rooms/by-code/${room.code}`,
      headers: bearer(boris),
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().id).toBe(room.id)
  })

  it('отвечает 404 на неизвестный код', async () => {
    const boris = await createGuestSession(ctx.app, 'Борис')

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/rooms/by-code/ZZZZZZ',
      headers: bearer(boris),
    })

    expect(res.statusCode).toBe(404)
  })
})

describe('POST /api/rooms/:id/leave', () => {
  it('убирает участника из комнаты', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')
    const boris = await createGuestSession(ctx.app, 'Борис')
    const room = await createRoom(ctx.app, anya, { name: 'Открытая' })
    await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${room.id}/join`,
      headers: bearer(boris),
      payload: {},
    })

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${room.id}/leave`,
      headers: bearer(boris),
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().memberCount).toBe(1)
  })
})
```

- [ ] **Step 2: Запустить тесты и убедиться, что они падают**

Run: `pnpm --filter server test rooms-join`
Expected: FAIL — 404, маршрутов нет

- [ ] **Step 3: Дописать поиск по коду в репозиторий**

`server/src/repo/rooms.ts` — добавить функцию после `findRoomSummary`:

```ts
export function findRoomByCode(db: Db, code: string): RoomRow | null {
  return (
    (db.prepare('SELECT * FROM rooms WHERE code = ?').get(code) as RoomRow | undefined) ?? null
  )
}
```

- [ ] **Step 4: Дописать маршруты**

`server/src/routes/rooms.ts` — добавить импорты `findRoomById`, `findRoomByCode`, `removeMember`, `verifyPassword` и три маршрута:

```ts
import { hashPassword, verifyPassword } from '../auth/passwords.js'
import {
  createRoom,
  addMember,
  removeMember,
  listOpenRooms,
  findRoomById,
  findRoomByCode,
  findRoomSummary,
  toRoomSummary,
} from '../repo/rooms.js'
```

```ts
const joinSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    properties: {
      password: { type: 'string', maxLength: 100 },
    },
  },
}
```

```ts
  app.get<{ Params: { code: string } }>(
    '/rooms/by-code/:code',
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const room = findRoomByCode(app.db, req.params.code.toUpperCase())
      if (!room || room.closed_at !== null) {
        return reply.code(404).send({ error: 'room_not_found' })
      }
      return toRoomSummary(findRoomSummary(app.db, room.id)!)
    },
  )

  app.post<{ Params: { id: string }; Body: { password?: string } }>(
    '/rooms/:id/join',
    { schema: joinSchema, preHandler: app.requireAuth },
    async (req, reply) => {
      const room = findRoomById(app.db, req.params.id)
      if (!room || room.closed_at !== null) {
        return reply.code(404).send({ error: 'room_not_found' })
      }

      if (room.password_hash !== null) {
        const password = req.body.password ?? ''
        if (!(await verifyPassword(room.password_hash, password))) {
          return reply.code(403).send({ error: 'wrong_password' })
        }
      }

      addMember(app.db, room.id, req.currentUser!.id)
      return toRoomSummary(findRoomSummary(app.db, room.id)!)
    },
  )

  app.post<{ Params: { id: string } }>(
    '/rooms/:id/leave',
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const room = findRoomById(app.db, req.params.id)
      if (!room) {
        return reply.code(404).send({ error: 'room_not_found' })
      }

      removeMember(app.db, room.id, req.currentUser!.id)
      return toRoomSummary(findRoomSummary(app.db, room.id)!)
    },
  )
```

- [ ] **Step 5: Запустить тесты и убедиться, что они проходят**

Run: `pnpm --filter server test rooms-join`
Expected: PASS, 9 тестов

- [ ] **Step 6: Коммит**

```bash
git add server/src server/test/rooms-join.test.ts
git commit -m "Добавить вход в комнату по паролю, поиск по коду и выход"
```

---

## Task 11: Старт игры и фиксация состава

**Files:**
- Create: `server/src/repo/games.ts`, `server/src/routes/games.ts`
- Modify: `server/src/app.ts`
- Test: `server/test/games.test.ts`

- [ ] **Step 1: Написать падающие тесты**

`server/test/games.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import {
  makeApp,
  closeApp,
  createGuestSession,
  bearer,
  type TestApp,
  type Guest,
} from './helpers.js'

let ctx: TestApp

beforeEach(async () => {
  ctx = await makeApp()
})

afterEach(async () => {
  await closeApp(ctx)
})

async function roomWithTwoPlayers(app: FastifyInstance): Promise<{
  roomId: string
  anya: Guest
  boris: Guest
}> {
  const anya = await createGuestSession(app, 'Аня')
  const boris = await createGuestSession(app, 'Борис')
  const created = await app.inject({
    method: 'POST',
    url: '/api/rooms',
    headers: bearer(anya),
    payload: { name: 'Вечер преферанса' },
  })
  const roomId = created.json().id
  await app.inject({
    method: 'POST',
    url: `/api/rooms/${roomId}/join`,
    headers: bearer(boris),
    payload: {},
  })
  return { roomId, anya, boris }
}

describe('POST /api/rooms/:id/games', () => {
  it('стартует игру и фиксирует состав из текущих участников', async () => {
    const { roomId, anya, boris } = await roomWithTwoPlayers(ctx.app)

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${roomId}/games`,
      headers: bearer(anya),
      payload: { scoreLimit: 100 },
    })

    expect(res.statusCode).toBe(200)
    const game = res.json()
    expect(game).toEqual({
      id: expect.any(String),
      roomId,
      scoreLimit: 100,
      status: 'active',
      startedAt: expect.any(Number),
      finishedAt: null,
      winnerUserId: null,
      playerIds: [anya.user.id, boris.user.id],
    })
  })

  it('запрещает старт не-хосту', async () => {
    const { roomId, boris } = await roomWithTwoPlayers(ctx.app)

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${roomId}/games`,
      headers: bearer(boris),
      payload: { scoreLimit: 100 },
    })

    expect(res.statusCode).toBe(403)
  })

  it('запрещает вторую активную игру в комнате', async () => {
    const { roomId, anya } = await roomWithTwoPlayers(ctx.app)
    await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${roomId}/games`,
      headers: bearer(anya),
      payload: { scoreLimit: 100 },
    })

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${roomId}/games`,
      headers: bearer(anya),
      payload: { scoreLimit: 100 },
    })

    expect(res.statusCode).toBe(409)
  })

  it('требует минимум двух игроков', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')
    const created = await ctx.app.inject({
      method: 'POST',
      url: '/api/rooms',
      headers: bearer(anya),
      payload: { name: 'Одиночество' },
    })

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${created.json().id}/games`,
      headers: bearer(anya),
      payload: { scoreLimit: 100 },
    })

    expect(res.statusCode).toBe(400)
  })

  it('отклоняет лимит вне диапазона', async () => {
    const { roomId, anya } = await roomWithTwoPlayers(ctx.app)

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${roomId}/games`,
      headers: bearer(anya),
      payload: { scoreLimit: 0 },
    })

    expect(res.statusCode).toBe(400)
  })

  it('не включает в состав ушедшего участника', async () => {
    const { roomId, anya, boris } = await roomWithTwoPlayers(ctx.app)
    const vera = await createGuestSession(ctx.app, 'Вера')
    await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${roomId}/join`,
      headers: bearer(vera),
      payload: {},
    })
    await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${roomId}/leave`,
      headers: bearer(vera),
    })

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${roomId}/games`,
      headers: bearer(anya),
      payload: { scoreLimit: 100 },
    })

    expect(res.json().playerIds).toEqual([anya.user.id, boris.user.id])
  })
})

describe('GET /api/games/:id', () => {
  it('отдаёт игру со счётом по каждому игроку', async () => {
    const { roomId, anya, boris } = await roomWithTwoPlayers(ctx.app)
    const started = await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${roomId}/games`,
      headers: bearer(anya),
      payload: { scoreLimit: 100 },
    })

    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/games/${started.json().id}`,
      headers: bearer(boris),
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().scores).toEqual({ [anya.user.id]: 0, [boris.user.id]: 0 })
    expect(res.json().entries).toEqual([])
  })

  it('не отдаёт игру постороннему', async () => {
    const { roomId, anya } = await roomWithTwoPlayers(ctx.app)
    const started = await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${roomId}/games`,
      headers: bearer(anya),
      payload: { scoreLimit: 100 },
    })
    const chuzhoj = await createGuestSession(ctx.app, 'Посторонний')

    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/games/${started.json().id}`,
      headers: bearer(chuzhoj),
    })

    expect(res.statusCode).toBe(403)
  })
})
```

- [ ] **Step 2: Запустить тесты и убедиться, что они падают**

Run: `pnpm --filter server test games`
Expected: FAIL — 404, маршрутов нет

- [ ] **Step 3: Написать репозиторий игр**

`server/src/repo/games.ts`:

```ts
import { randomUUID } from 'node:crypto'
import type { Game } from '@score/shared'
import type { Db } from '../db/index.js'

export type GameRow = {
  id: string
  room_id: string
  score_limit: number
  status: 'active' | 'finished' | 'abandoned'
  started_at: number
  finished_at: number | null
  winner_user_id: string | null
}

export function toGame(row: GameRow): Game {
  return {
    id: row.id,
    roomId: row.room_id,
    scoreLimit: row.score_limit,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    winnerUserId: row.winner_user_id,
  }
}

export function findGameById(db: Db, id: string): GameRow | null {
  return (db.prepare('SELECT * FROM games WHERE id = ?').get(id) as GameRow | undefined) ?? null
}

export function findActiveGame(db: Db, roomId: string): GameRow | null {
  return (
    (db
      .prepare(`SELECT * FROM games WHERE room_id = ? AND status = 'active'`)
      .get(roomId) as GameRow | undefined) ?? null
  )
}

export function listGamePlayerIds(db: Db, gameId: string): string[] {
  return (
    db
      .prepare('SELECT user_id FROM game_players WHERE game_id = ? ORDER BY seat')
      .all(gameId) as { user_id: string }[]
  ).map((row) => row.user_id)
}

/** Состав копируется из переданного списка одной транзакцией со строкой игры. */
export function startGame(
  db: Db,
  roomId: string,
  scoreLimit: number,
  playerIds: string[],
): GameRow {
  const row: GameRow = {
    id: randomUUID(),
    room_id: roomId,
    score_limit: scoreLimit,
    status: 'active',
    started_at: Date.now(),
    finished_at: null,
    winner_user_id: null,
  }

  const insertGame = db.prepare(
    `INSERT INTO games (id, room_id, score_limit, status, started_at, finished_at, winner_user_id)
     VALUES (@id, @room_id, @score_limit, @status, @started_at, @finished_at, @winner_user_id)`,
  )
  const insertPlayer = db.prepare(
    'INSERT INTO game_players (game_id, user_id, seat) VALUES (?, ?, ?)',
  )

  db.transaction(() => {
    insertGame.run(row)
    playerIds.forEach((userId, seat) => insertPlayer.run(row.id, userId, seat))
  })()

  return row
}

export function finishGame(db: Db, gameId: string, winnerUserId: string): void {
  db.prepare(
    `UPDATE games SET status = 'finished', finished_at = ?, winner_user_id = ?
     WHERE id = ? AND status = 'active'`,
  ).run(Date.now(), winnerUserId, gameId)
}
```

- [ ] **Step 4: Написать репозиторий записей очков (нужен для чтения игры)**

`server/src/repo/entries.ts`:

```ts
import type { ScoreEntry } from '@score/shared'
import type { Db } from '../db/index.js'

export type EntryRow = {
  seq: number
  id: string
  game_id: string
  user_id: string
  points: number
  created_by: string
  created_at: number
  voided_at: number | null
  voided_by: string | null
}

export function toScoreEntry(row: EntryRow): ScoreEntry {
  return {
    seq: row.seq,
    id: row.id,
    gameId: row.game_id,
    userId: row.user_id,
    points: row.points,
    createdBy: row.created_by,
    createdAt: row.created_at,
    voidedAt: row.voided_at,
    voidedBy: row.voided_by,
  }
}

export function listEntries(db: Db, gameId: string): ScoreEntry[] {
  return (
    db.prepare('SELECT * FROM score_entries WHERE game_id = ? ORDER BY seq').all(gameId) as EntryRow[]
  ).map(toScoreEntry)
}
```

- [ ] **Step 5: Написать маршруты игр**

`server/src/routes/games.ts`:

```ts
import type { FastifyInstance } from 'fastify'
import { canStartGame } from '../domain/permissions.js'
import { scoreboard } from '../domain/score.js'
import { findRoomById, listMemberIds, isMember } from '../repo/rooms.js'
import {
  startGame,
  findActiveGame,
  findGameById,
  listGamePlayerIds,
  toGame,
} from '../repo/games.js'
import { listEntries } from '../repo/entries.js'

const startSchema = {
  body: {
    type: 'object',
    required: ['scoreLimit'],
    additionalProperties: false,
    properties: {
      scoreLimit: { type: 'integer', minimum: 1, maximum: 10000 },
    },
  },
}

export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 10

export default async function gameRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { id: string }; Body: { scoreLimit: number } }>(
    '/rooms/:id/games',
    { schema: startSchema, preHandler: app.requireAuth },
    async (req, reply) => {
      const room = findRoomById(app.db, req.params.id)
      if (!room || room.closed_at !== null) {
        return reply.code(404).send({ error: 'room_not_found' })
      }

      const playerIds = listMemberIds(app.db, room.id)
      const ctx = { actorId: req.currentUser!.id, hostId: room.host_user_id, playerIds }
      if (!canStartGame(ctx)) {
        return reply.code(403).send({ error: 'only_host_may_start' })
      }
      if (findActiveGame(app.db, room.id)) {
        return reply.code(409).send({ error: 'game_already_active' })
      }
      if (playerIds.length < MIN_PLAYERS || playerIds.length > MAX_PLAYERS) {
        return reply.code(400).send({ error: 'bad_player_count' })
      }

      const game = startGame(app.db, room.id, req.body.scoreLimit, playerIds)
      return { ...toGame(game), playerIds }
    },
  )

  app.get<{ Params: { id: string } }>(
    '/games/:id',
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const game = findGameById(app.db, req.params.id)
      if (!game) {
        return reply.code(404).send({ error: 'game_not_found' })
      }
      if (!isMember(app.db, game.room_id, req.currentUser!.id)) {
        return reply.code(403).send({ error: 'not_a_member' })
      }

      const playerIds = listGamePlayerIds(app.db, game.id)
      const entries = listEntries(app.db, game.id)

      return {
        ...toGame(game),
        playerIds,
        entries,
        scores: scoreboard(entries, playerIds),
      }
    },
  )
}
```

- [ ] **Step 6: Подключить маршруты в `buildApp`**

`server/src/app.ts` — добавить импорт и регистрацию:

```ts
import gameRoutes from './routes/games.js'
```

и после регистрации `roomRoutes`:

```ts
  app.register(gameRoutes, { prefix: '/api' })
```

- [ ] **Step 7: Запустить тесты и убедиться, что они проходят**

Run: `pnpm --filter server test games`
Expected: PASS, 8 тестов

- [ ] **Step 8: Коммит**

```bash
git add server/src server/test/games.test.ts
git commit -m "Добавить старт игры с фиксацией состава и чтение игры"
```

---

## Task 12: Запись очков с идемпотентностью

**Files:**
- Create: `server/src/routes/entries.ts`
- Modify: `server/src/repo/entries.ts`, `server/src/app.ts`
- Test: `server/test/entries.test.ts`

- [ ] **Step 1: Написать падающие тесты**

`server/test/entries.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import {
  makeApp,
  closeApp,
  createGuestSession,
  bearer,
  type TestApp,
  type Guest,
} from './helpers.js'

let ctx: TestApp

beforeEach(async () => {
  ctx = await makeApp()
})

afterEach(async () => {
  await closeApp(ctx)
})

type Table = { gameId: string; anya: Guest; boris: Guest }

async function tableOfTwo(app: FastifyInstance, scoreLimit = 100): Promise<Table> {
  const anya = await createGuestSession(app, 'Аня')
  const boris = await createGuestSession(app, 'Борис')
  const room = await app.inject({
    method: 'POST',
    url: '/api/rooms',
    headers: bearer(anya),
    payload: { name: 'Вечер преферанса' },
  })
  const roomId = room.json().id
  await app.inject({
    method: 'POST',
    url: `/api/rooms/${roomId}/join`,
    headers: bearer(boris),
    payload: {},
  })
  const game = await app.inject({
    method: 'POST',
    url: `/api/rooms/${roomId}/games`,
    headers: bearer(anya),
    payload: { scoreLimit },
  })
  return { gameId: game.json().id, anya, boris }
}

describe('POST /api/games/:id/entries', () => {
  it('записывает очки себе', async () => {
    const { gameId, boris } = await tableOfTwo(ctx.app)

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/games/${gameId}/entries`,
      headers: bearer(boris),
      payload: { id: randomUUID(), userId: boris.user.id, points: 12 },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().entry).toEqual({
      seq: expect.any(Number),
      id: expect.any(String),
      gameId,
      userId: boris.user.id,
      points: 12,
      createdBy: boris.user.id,
      createdAt: expect.any(Number),
      voidedAt: null,
      voidedBy: null,
    })
    expect(res.json().scores[boris.user.id]).toBe(12)
  })

  it('повторный запрос с тем же id не добавляет вторую запись', async () => {
    const { gameId, boris } = await tableOfTwo(ctx.app)
    const entryId = randomUUID()
    const payload = { id: entryId, userId: boris.user.id, points: 12 }

    await ctx.app.inject({
      method: 'POST',
      url: `/api/games/${gameId}/entries`,
      headers: bearer(boris),
      payload,
    })
    const second = await ctx.app.inject({
      method: 'POST',
      url: `/api/games/${gameId}/entries`,
      headers: bearer(boris),
      payload,
    })

    expect(second.statusCode).toBe(200)
    expect(second.json().scores[boris.user.id]).toBe(12)
    const count = ctx.db
      .prepare('SELECT COUNT(*) AS n FROM score_entries WHERE game_id = ?')
      .get(gameId) as { n: number }
    expect(count.n).toBe(1)
  })

  it('принимает отрицательные очки', async () => {
    const { gameId, boris } = await tableOfTwo(ctx.app)
    await ctx.app.inject({
      method: 'POST',
      url: `/api/games/${gameId}/entries`,
      headers: bearer(boris),
      payload: { id: randomUUID(), userId: boris.user.id, points: 20 },
    })

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/games/${gameId}/entries`,
      headers: bearer(boris),
      payload: { id: randomUUID(), userId: boris.user.id, points: -5 },
    })

    expect(res.json().scores[boris.user.id]).toBe(15)
  })

  it('отклоняет ноль очков', async () => {
    const { gameId, boris } = await tableOfTwo(ctx.app)

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/games/${gameId}/entries`,
      headers: bearer(boris),
      payload: { id: randomUUID(), userId: boris.user.id, points: 0 },
    })

    expect(res.statusCode).toBe(400)
  })

  it('запрещает обычному игроку писать очки другому', async () => {
    const { gameId, anya, boris } = await tableOfTwo(ctx.app)

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/games/${gameId}/entries`,
      headers: bearer(boris),
      payload: { id: randomUUID(), userId: anya.user.id, points: 12 },
    })

    expect(res.statusCode).toBe(403)
  })

  it('разрешает хосту исправить чужой счёт', async () => {
    const { gameId, anya, boris } = await tableOfTwo(ctx.app)

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/games/${gameId}/entries`,
      headers: bearer(anya),
      payload: { id: randomUUID(), userId: boris.user.id, points: 12 },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().entry.createdBy).toBe(anya.user.id)
    expect(res.json().entry.userId).toBe(boris.user.id)
  })

  it('запрещает запись постороннему', async () => {
    const { gameId } = await tableOfTwo(ctx.app)
    const chuzhoj = await createGuestSession(ctx.app, 'Посторонний')

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/games/${gameId}/entries`,
      headers: bearer(chuzhoj),
      payload: { id: randomUUID(), userId: chuzhoj.user.id, points: 12 },
    })

    expect(res.statusCode).toBe(403)
  })

  it('отвечает 404 на несуществующую игру', async () => {
    const boris = await createGuestSession(ctx.app, 'Борис')

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/games/нет-такой/entries',
      headers: bearer(boris),
      payload: { id: randomUUID(), userId: boris.user.id, points: 12 },
    })

    expect(res.statusCode).toBe(404)
  })
})
```

- [ ] **Step 2: Запустить тесты и убедиться, что они падают**

Run: `pnpm --filter server test entries`
Expected: FAIL — 404, маршрута нет

- [ ] **Step 3: Дописать репозиторий записей**

`server/src/repo/entries.ts` — добавить после `listEntries`:

```ts
export function findEntryByClientId(db: Db, id: string): ScoreEntry | null {
  const row = db.prepare('SELECT * FROM score_entries WHERE id = ?').get(id) as EntryRow | undefined
  return row ? toScoreEntry(row) : null
}

export type NewEntry = {
  id: string
  gameId: string
  userId: string
  points: number
  createdBy: string
}

export function insertEntry(db: Db, entry: NewEntry): ScoreEntry {
  const info = db
    .prepare(
      `INSERT INTO score_entries (id, game_id, user_id, points, created_by, created_at)
       VALUES (@id, @gameId, @userId, @points, @createdBy, @createdAt)`,
    )
    .run({ ...entry, createdAt: Date.now() })

  const row = db
    .prepare('SELECT * FROM score_entries WHERE seq = ?')
    .get(info.lastInsertRowid) as EntryRow
  return toScoreEntry(row)
}
```

- [ ] **Step 4: Написать маршрут**

`server/src/routes/entries.ts`:

```ts
import type { FastifyInstance } from 'fastify'
import { canAddEntryFor } from '../domain/permissions.js'
import { scoreboard } from '../domain/score.js'
import { findRoomById } from '../repo/rooms.js'
import { findGameById, listGamePlayerIds } from '../repo/games.js'
import { listEntries, findEntryByClientId, insertEntry } from '../repo/entries.js'

const addEntrySchema = {
  body: {
    type: 'object',
    required: ['id', 'userId', 'points'],
    additionalProperties: false,
    properties: {
      id: { type: 'string', minLength: 1, maxLength: 64 },
      userId: { type: 'string', minLength: 1, maxLength: 64 },
      points: { type: 'integer', minimum: -10000, maximum: 10000, not: { const: 0 } },
    },
  },
}

type AddEntryBody = { id: string; userId: string; points: number }

export default async function entryRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { id: string }; Body: AddEntryBody }>(
    '/games/:id/entries',
    { schema: addEntrySchema, preHandler: app.requireAuth },
    async (req, reply) => {
      const game = findGameById(app.db, req.params.id)
      if (!game) {
        return reply.code(404).send({ error: 'game_not_found' })
      }
      if (game.status !== 'active') {
        return reply.code(409).send({ error: 'game_not_active' })
      }

      const room = findRoomById(app.db, game.room_id)!
      const playerIds = listGamePlayerIds(app.db, game.id)
      const ctx = { actorId: req.currentUser!.id, hostId: room.host_user_id, playerIds }

      if (!canAddEntryFor(ctx, req.body.userId)) {
        return reply.code(403).send({ error: 'not_allowed' })
      }

      // Повтор того же запроса возвращает уже созданную запись, а не создаёт вторую.
      const existing = findEntryByClientId(app.db, req.body.id)
      const entry =
        existing ??
        insertEntry(app.db, {
          id: req.body.id,
          gameId: game.id,
          userId: req.body.userId,
          points: req.body.points,
          createdBy: req.currentUser!.id,
        })

      const entries = listEntries(app.db, game.id)
      return { entry, scores: scoreboard(entries, playerIds) }
    },
  )
}
```

- [ ] **Step 5: Подключить маршрут в `buildApp`**

`server/src/app.ts` — добавить импорт и регистрацию:

```ts
import entryRoutes from './routes/entries.js'
```

и после регистрации `gameRoutes`:

```ts
  app.register(entryRoutes, { prefix: '/api' })
```

- [ ] **Step 6: Запустить тесты и убедиться, что они проходят**

Run: `pnpm --filter server test entries`
Expected: PASS, 8 тестов

- [ ] **Step 7: Коммит**

```bash
git add server/src server/test/entries.test.ts
git commit -m "Добавить запись очков с идемпотентностью по клиентскому id"
```

---

## Task 13: Отмена записи

**Files:**
- Modify: `server/src/repo/entries.ts`, `server/src/routes/entries.ts`
- Test: `server/test/entries-void.test.ts`

- [ ] **Step 1: Написать падающие тесты**

`server/test/entries-void.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import {
  makeApp,
  closeApp,
  createGuestSession,
  bearer,
  type TestApp,
  type Guest,
} from './helpers.js'

let ctx: TestApp

beforeEach(async () => {
  ctx = await makeApp()
})

afterEach(async () => {
  await closeApp(ctx)
})

type Table = { gameId: string; anya: Guest; boris: Guest }

async function tableOfTwo(app: FastifyInstance, scoreLimit = 100): Promise<Table> {
  const anya = await createGuestSession(app, 'Аня')
  const boris = await createGuestSession(app, 'Борис')
  const room = await app.inject({
    method: 'POST',
    url: '/api/rooms',
    headers: bearer(anya),
    payload: { name: 'Вечер преферанса' },
  })
  const roomId = room.json().id
  await app.inject({
    method: 'POST',
    url: `/api/rooms/${roomId}/join`,
    headers: bearer(boris),
    payload: {},
  })
  const game = await app.inject({
    method: 'POST',
    url: `/api/rooms/${roomId}/games`,
    headers: bearer(anya),
    payload: { scoreLimit },
  })
  return { gameId: game.json().id, anya, boris }
}

async function addEntry(
  app: FastifyInstance,
  gameId: string,
  actor: Guest,
  userId: string,
  points: number,
): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: `/api/games/${gameId}/entries`,
    headers: bearer(actor),
    payload: { id: randomUUID(), userId, points },
  })
  return res.json().entry.id
}

describe('POST /api/entries/:id/void', () => {
  it('отменяет свою запись и убирает её из счёта', async () => {
    const { gameId, boris } = await tableOfTwo(ctx.app)
    const entryId = await addEntry(ctx.app, gameId, boris, boris.user.id, 12)

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/entries/${entryId}/void`,
      headers: bearer(boris),
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().scores[boris.user.id]).toBe(0)
  })

  it('сохраняет отменённую запись в журнале', async () => {
    const { gameId, boris } = await tableOfTwo(ctx.app)
    const entryId = await addEntry(ctx.app, gameId, boris, boris.user.id, 12)

    await ctx.app.inject({
      method: 'POST',
      url: `/api/entries/${entryId}/void`,
      headers: bearer(boris),
    })

    const row = ctx.db
      .prepare('SELECT voided_at, voided_by FROM score_entries WHERE id = ?')
      .get(entryId) as { voided_at: number; voided_by: string }
    expect(row.voided_at).toEqual(expect.any(Number))
    expect(row.voided_by).toBe(boris.user.id)
  })

  it('запрещает обычному игроку отменять чужую запись', async () => {
    const { gameId, anya, boris } = await tableOfTwo(ctx.app)
    const entryId = await addEntry(ctx.app, gameId, anya, anya.user.id, 12)

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/entries/${entryId}/void`,
      headers: bearer(boris),
    })

    expect(res.statusCode).toBe(403)
  })

  it('разрешает хосту отменить чужую запись', async () => {
    const { gameId, anya, boris } = await tableOfTwo(ctx.app)
    const entryId = await addEntry(ctx.app, gameId, boris, boris.user.id, 12)

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/entries/${entryId}/void`,
      headers: bearer(anya),
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().scores[boris.user.id]).toBe(0)
  })

  it('повторная отмена не меняет автора и время отмены', async () => {
    const { gameId, anya, boris } = await tableOfTwo(ctx.app)
    const entryId = await addEntry(ctx.app, gameId, boris, boris.user.id, 12)
    await ctx.app.inject({
      method: 'POST',
      url: `/api/entries/${entryId}/void`,
      headers: bearer(boris),
    })
    const before = ctx.db
      .prepare('SELECT voided_at, voided_by FROM score_entries WHERE id = ?')
      .get(entryId)

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/entries/${entryId}/void`,
      headers: bearer(anya),
    })

    expect(res.statusCode).toBe(200)
    const after = ctx.db
      .prepare('SELECT voided_at, voided_by FROM score_entries WHERE id = ?')
      .get(entryId)
    expect(after).toEqual(before)
  })

  it('отвечает 404 на несуществующую запись', async () => {
    const boris = await createGuestSession(ctx.app, 'Борис')

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/entries/нет-такой/void',
      headers: bearer(boris),
    })

    expect(res.statusCode).toBe(404)
  })
})
```

- [ ] **Step 2: Запустить тесты и убедиться, что они падают**

Run: `pnpm --filter server test entries-void`
Expected: FAIL — 404, маршрута нет

- [ ] **Step 3: Дописать репозиторий**

`server/src/repo/entries.ts` — добавить в конец:

```ts
/** Отмена идемпотентна: повторный вызов не переписывает автора и время. */
export function voidEntry(db: Db, id: string, voidedBy: string): void {
  db.prepare(
    'UPDATE score_entries SET voided_at = ?, voided_by = ? WHERE id = ? AND voided_at IS NULL',
  ).run(Date.now(), voidedBy, id)
}
```

- [ ] **Step 4: Дописать маршрут**

`server/src/routes/entries.ts` — добавить `voidEntry` в импорт из репозитория и маршрут в конец функции:

```ts
import { listEntries, findEntryByClientId, insertEntry, voidEntry } from '../repo/entries.js'
```

```ts
  app.post<{ Params: { id: string } }>(
    '/entries/:id/void',
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const entry = findEntryByClientId(app.db, req.params.id)
      if (!entry) {
        return reply.code(404).send({ error: 'entry_not_found' })
      }

      const game = findGameById(app.db, entry.gameId)!
      const room = findRoomById(app.db, game.room_id)!
      const playerIds = listGamePlayerIds(app.db, game.id)
      const ctx = { actorId: req.currentUser!.id, hostId: room.host_user_id, playerIds }

      if (!canVoidEntry(ctx, entry.userId)) {
        return reply.code(403).send({ error: 'not_allowed' })
      }

      voidEntry(app.db, entry.id, req.currentUser!.id)

      const entries = listEntries(app.db, game.id)
      return { scores: scoreboard(entries, playerIds) }
    },
  )
```

и добавить `canVoidEntry` в импорт прав:

```ts
import { canAddEntryFor, canVoidEntry } from '../domain/permissions.js'
```

- [ ] **Step 5: Запустить тесты и убедиться, что они проходят**

Run: `pnpm --filter server test entries-void`
Expected: PASS, 6 тестов

- [ ] **Step 6: Коммит**

```bash
git add server/src server/test/entries-void.test.ts
git commit -m "Добавить отмену записи очков без удаления из журнала"
```

---

## Task 14: Завершение игры при достижении лимита

**Files:**
- Modify: `server/src/routes/entries.ts`
- Test: `server/test/victory-flow.test.ts`

Ключевое требование: проверка победы и запись победителя происходят в одной транзакции со вставкой записи, иначе два почти одновременных запроса могут объявить двух победителей.

- [ ] **Step 1: Написать падающие тесты**

`server/test/victory-flow.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import {
  makeApp,
  closeApp,
  createGuestSession,
  bearer,
  type TestApp,
  type Guest,
} from './helpers.js'

let ctx: TestApp

beforeEach(async () => {
  ctx = await makeApp()
})

afterEach(async () => {
  await closeApp(ctx)
})

type Table = { roomId: string; gameId: string; anya: Guest; boris: Guest }

async function tableOfTwo(app: FastifyInstance, scoreLimit: number): Promise<Table> {
  const anya = await createGuestSession(app, 'Аня')
  const boris = await createGuestSession(app, 'Борис')
  const room = await app.inject({
    method: 'POST',
    url: '/api/rooms',
    headers: bearer(anya),
    payload: { name: 'Вечер преферанса' },
  })
  const roomId = room.json().id
  await app.inject({
    method: 'POST',
    url: `/api/rooms/${roomId}/join`,
    headers: bearer(boris),
    payload: {},
  })
  const game = await app.inject({
    method: 'POST',
    url: `/api/rooms/${roomId}/games`,
    headers: bearer(anya),
    payload: { scoreLimit },
  })
  return { roomId, gameId: game.json().id, anya, boris }
}

function addEntry(app: FastifyInstance, gameId: string, actor: Guest, points: number) {
  return app.inject({
    method: 'POST',
    url: `/api/games/${gameId}/entries`,
    headers: bearer(actor),
    payload: { id: randomUUID(), userId: actor.user.id, points },
  })
}

describe('завершение игры', () => {
  it('объявляет победителя при достижении лимита', async () => {
    const { gameId, boris } = await tableOfTwo(ctx.app, 50)

    const res = await addEntry(ctx.app, gameId, boris, 50)

    expect(res.json().game).toEqual(
      expect.objectContaining({
        status: 'finished',
        winnerUserId: boris.user.id,
        finishedAt: expect.any(Number),
      }),
    )
  })

  it('не завершает игру до достижения лимита', async () => {
    const { gameId, boris } = await tableOfTwo(ctx.app, 50)

    const res = await addEntry(ctx.app, gameId, boris, 49)

    expect(res.json().game).toEqual(
      expect.objectContaining({ status: 'active', winnerUserId: null }),
    )
  })

  it('отклоняет запись очков в завершённую игру', async () => {
    const { gameId, anya, boris } = await tableOfTwo(ctx.app, 50)
    await addEntry(ctx.app, gameId, boris, 50)

    const res = await addEntry(ctx.app, gameId, anya, 10)

    expect(res.statusCode).toBe(409)
  })

  it('возвращает игру в активное состояние, если победная запись отменена', async () => {
    const { gameId, boris } = await tableOfTwo(ctx.app, 50)
    const winning = await addEntry(ctx.app, gameId, boris, 50)
    const entryId = winning.json().entry.id

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/entries/${entryId}/void`,
      headers: bearer(boris),
    })

    expect(res.json().game).toEqual(
      expect.objectContaining({ status: 'active', winnerUserId: null, finishedAt: null }),
    )
  })

  it('позволяет стартовать новую игру тем же составом после победы', async () => {
    const { roomId, gameId, anya, boris } = await tableOfTwo(ctx.app, 50)
    await addEntry(ctx.app, gameId, boris, 50)

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${roomId}/games`,
      headers: bearer(anya),
      payload: { scoreLimit: 50 },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().id).not.toBe(gameId)
    expect(res.json().playerIds).toEqual([anya.user.id, boris.user.id])
  })
})
```

- [ ] **Step 2: Запустить тесты и убедиться, что они падают**

Run: `pnpm --filter server test victory-flow`
Expected: FAIL — в ответе нет поля `game`

- [ ] **Step 3: Дописать возврат игры в состояние active при отмене**

`server/src/repo/games.ts` — добавить в конец:

```ts
/** Отмена победной записи возвращает игру в активное состояние. */
export function reopenGame(db: Db, gameId: string): void {
  db.prepare(
    `UPDATE games SET status = 'active', finished_at = NULL, winner_user_id = NULL
     WHERE id = ? AND status = 'finished'`,
  ).run(gameId)
}
```

- [ ] **Step 4: Пересчитывать исход после каждого изменения журнала**

`server/src/routes/entries.ts` — полное содержимое файла после изменения:

```ts
import type { FastifyInstance } from 'fastify'
import { canAddEntryFor, canVoidEntry } from '../domain/permissions.js'
import { scoreboard } from '../domain/score.js'
import { findWinner } from '../domain/victory.js'
import { findRoomById } from '../repo/rooms.js'
import {
  findGameById,
  listGamePlayerIds,
  finishGame,
  reopenGame,
  toGame,
  type GameRow,
} from '../repo/games.js'
import {
  listEntries,
  findEntryByClientId,
  insertEntry,
  voidEntry,
} from '../repo/entries.js'
import type { Db } from '../db/index.js'

const addEntrySchema = {
  body: {
    type: 'object',
    required: ['id', 'userId', 'points'],
    additionalProperties: false,
    properties: {
      id: { type: 'string', minLength: 1, maxLength: 64 },
      userId: { type: 'string', minLength: 1, maxLength: 64 },
      points: { type: 'integer', minimum: -10000, maximum: 10000, not: { const: 0 } },
    },
  },
}

type AddEntryBody = { id: string; userId: string; points: number }

/**
 * Пересчитывает исход по всему журналу и приводит строку игры в соответствие.
 * Вызывается внутри той же транзакции, что и изменение журнала, — иначе два
 * почти одновременных запроса могут объявить двух победителей.
 */
function settleGame(db: Db, game: GameRow, playerIds: string[]): GameRow {
  const winner = findWinner(listEntries(db, game.id), playerIds, game.score_limit)

  if (winner && game.status === 'active') {
    finishGame(db, game.id, winner)
  } else if (!winner && game.status === 'finished') {
    reopenGame(db, game.id)
  }

  return findGameById(db, game.id)!
}

export default async function entryRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { id: string }; Body: AddEntryBody }>(
    '/games/:id/entries',
    { schema: addEntrySchema, preHandler: app.requireAuth },
    async (req, reply) => {
      const game = findGameById(app.db, req.params.id)
      if (!game) {
        return reply.code(404).send({ error: 'game_not_found' })
      }
      if (game.status !== 'active') {
        return reply.code(409).send({ error: 'game_not_active' })
      }

      const room = findRoomById(app.db, game.room_id)!
      const playerIds = listGamePlayerIds(app.db, game.id)
      const ctx = { actorId: req.currentUser!.id, hostId: room.host_user_id, playerIds }

      if (!canAddEntryFor(ctx, req.body.userId)) {
        return reply.code(403).send({ error: 'not_allowed' })
      }

      const result = app.db.transaction(() => {
        // Повтор того же запроса возвращает уже созданную запись, а не создаёт вторую.
        const existing = findEntryByClientId(app.db, req.body.id)
        const entry =
          existing ??
          insertEntry(app.db, {
            id: req.body.id,
            gameId: game.id,
            userId: req.body.userId,
            points: req.body.points,
            createdBy: req.currentUser!.id,
          })

        const settled = settleGame(app.db, game, playerIds)
        return { entry, settled }
      })()

      return {
        entry: result.entry,
        game: toGame(result.settled),
        scores: scoreboard(listEntries(app.db, game.id), playerIds),
      }
    },
  )

  app.post<{ Params: { id: string } }>(
    '/entries/:id/void',
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const entry = findEntryByClientId(app.db, req.params.id)
      if (!entry) {
        return reply.code(404).send({ error: 'entry_not_found' })
      }

      const game = findGameById(app.db, entry.gameId)!
      const room = findRoomById(app.db, game.room_id)!
      const playerIds = listGamePlayerIds(app.db, game.id)
      const ctx = { actorId: req.currentUser!.id, hostId: room.host_user_id, playerIds }

      if (!canVoidEntry(ctx, entry.userId)) {
        return reply.code(403).send({ error: 'not_allowed' })
      }

      const settled = app.db.transaction(() => {
        voidEntry(app.db, entry.id, req.currentUser!.id)
        return settleGame(app.db, game, playerIds)
      })()

      return {
        game: toGame(settled),
        scores: scoreboard(listEntries(app.db, game.id), playerIds),
      }
    },
  )
}
```

- [ ] **Step 5: Запустить все тесты и убедиться, что они проходят**

Run: `pnpm --filter server test`
Expected: PASS — все тесты, включая 5 новых в `victory-flow`

- [ ] **Step 6: Проверить типы и сборку**

Run: `pnpm typecheck && pnpm --filter server build`
Expected: без ошибок, появляется `server/dist/server.js`

- [ ] **Step 7: Коммит**

```bash
git add server/src server/test/victory-flow.test.ts
git commit -m "Завершать игру при достижении лимита и переоткрывать при отмене"
```

---

## Task 15: Ограничение частоты попыток входа в комнату

**Files:**
- Modify: `server/src/app.ts`, `server/src/routes/rooms.ts`, `server/package.json`
- Test: `server/test/rooms-ratelimit.test.ts`, `server/test/rooms-leave-midgame.test.ts`

Без этого пароль комнаты из шести символов подбирается перебором за минуты. Ключ ограничения — пара «IP + комната», чтобы один подбирающий не блокировал вход остальным в другие комнаты.

- [ ] **Step 1: Написать падающие тесты**

`server/test/rooms-ratelimit.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { makeApp, closeApp, createGuestSession, bearer, type TestApp } from './helpers.js'

let ctx: TestApp

beforeEach(async () => {
  ctx = await makeApp()
})

afterEach(async () => {
  await closeApp(ctx)
})

describe('ограничение попыток входа', () => {
  it('блокирует после 10 неверных паролей подряд', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')
    const boris = await createGuestSession(ctx.app, 'Борис')
    const room = await ctx.app.inject({
      method: 'POST',
      url: '/api/rooms',
      headers: bearer(anya),
      payload: { name: 'Закрытая', password: 'дружеский' },
    })
    const roomId = room.json().id

    const codes: number[] = []
    for (let attempt = 0; attempt < 12; attempt++) {
      const res = await ctx.app.inject({
        method: 'POST',
        url: `/api/rooms/${roomId}/join`,
        headers: bearer(boris),
        payload: { password: `подбор-${attempt}` },
      })
      codes.push(res.statusCode)
    }

    expect(codes.slice(0, 10)).toEqual(Array(10).fill(403))
    expect(codes.at(-1)).toBe(429)
  })

  it('не мешает входить в другую комнату', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')
    const boris = await createGuestSession(ctx.app, 'Борис')
    const closed = await ctx.app.inject({
      method: 'POST',
      url: '/api/rooms',
      headers: bearer(anya),
      payload: { name: 'Закрытая', password: 'дружеский' },
    })
    const open = await ctx.app.inject({
      method: 'POST',
      url: '/api/rooms',
      headers: bearer(anya),
      payload: { name: 'Открытая' },
    })

    for (let attempt = 0; attempt < 12; attempt++) {
      await ctx.app.inject({
        method: 'POST',
        url: `/api/rooms/${closed.json().id}/join`,
        headers: bearer(boris),
        payload: { password: `подбор-${attempt}` },
      })
    }

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${open.json().id}/join`,
      headers: bearer(boris),
      payload: {},
    })

    expect(res.statusCode).toBe(200)
  })
})
```

`server/test/rooms-leave-midgame.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import { makeApp, closeApp, createGuestSession, bearer, type TestApp } from './helpers.js'

let ctx: TestApp

beforeEach(async () => {
  ctx = await makeApp()
})

afterEach(async () => {
  await closeApp(ctx)
})

describe('выход из комнаты во время игры', () => {
  it('сохраняет игрока в составе и его очки в счёте', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')
    const boris = await createGuestSession(ctx.app, 'Борис')
    const room = await ctx.app.inject({
      method: 'POST',
      url: '/api/rooms',
      headers: bearer(anya),
      payload: { name: 'Вечер преферанса' },
    })
    const roomId = room.json().id
    await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${roomId}/join`,
      headers: bearer(boris),
      payload: {},
    })
    const game = await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${roomId}/games`,
      headers: bearer(anya),
      payload: { scoreLimit: 100 },
    })
    const gameId = game.json().id
    await ctx.app.inject({
      method: 'POST',
      url: `/api/games/${gameId}/entries`,
      headers: bearer(boris),
      payload: { id: randomUUID(), userId: boris.user.id, points: 30 },
    })

    await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${roomId}/leave`,
      headers: bearer(boris),
    })

    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/games/${gameId}`,
      headers: bearer(anya),
    })
    expect(res.json().playerIds).toContain(boris.user.id)
    expect(res.json().scores[boris.user.id]).toBe(30)
  })

  it('позволяет вернувшемуся игроку снова писать очки', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')
    const boris = await createGuestSession(ctx.app, 'Борис')
    const room = await ctx.app.inject({
      method: 'POST',
      url: '/api/rooms',
      headers: bearer(anya),
      payload: { name: 'Вечер преферанса' },
    })
    const roomId = room.json().id
    await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${roomId}/join`,
      headers: bearer(boris),
      payload: {},
    })
    const game = await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${roomId}/games`,
      headers: bearer(anya),
      payload: { scoreLimit: 100 },
    })
    await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${roomId}/leave`,
      headers: bearer(boris),
    })
    await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${roomId}/join`,
      headers: bearer(boris),
      payload: {},
    })

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/games/${game.json().id}/entries`,
      headers: bearer(boris),
      payload: { id: randomUUID(), userId: boris.user.id, points: 10 },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().scores[boris.user.id]).toBe(10)
  })
})
```

- [ ] **Step 2: Запустить тесты и убедиться, что первый падает**

Run: `pnpm --filter server test rooms-ratelimit rooms-leave-midgame`
Expected: `rooms-ratelimit` FAIL — получено 403 вместо 429; `rooms-leave-midgame` PASS — поведение уже верное, тесты закрепляют его от регрессий

- [ ] **Step 3: Установить плагин**

Run: `pnpm --filter server add @fastify/rate-limit`

- [ ] **Step 4: Подключить ограничение к маршруту входа**

`server/src/app.ts` — добавить импорт и регистрацию до маршрутов:

```ts
import rateLimit from '@fastify/rate-limit'
```

```ts
  app.register(rateLimit, { global: false })
```

`server/src/routes/rooms.ts` — заменить объявление маршрута `/rooms/:id/join`, добавив конфигурацию ограничения:

```ts
  app.post<{ Params: { id: string }; Body: { password?: string } }>(
    '/rooms/:id/join',
    {
      schema: joinSchema,
      preHandler: app.requireAuth,
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '5 minutes',
          // Ключ по паре «клиент + комната»: подбор пароля к одной комнате
          // не должен закрывать вход в остальные.
          keyGenerator: (req: { ip: string; params: unknown }) =>
            `${req.ip}:${(req.params as { id: string }).id}`,
        },
      },
    },
    async (req, reply) => {
      const room = findRoomById(app.db, req.params.id)
      if (!room || room.closed_at !== null) {
        return reply.code(404).send({ error: 'room_not_found' })
      }

      if (room.password_hash !== null) {
        const password = req.body.password ?? ''
        if (!(await verifyPassword(room.password_hash, password))) {
          return reply.code(403).send({ error: 'wrong_password' })
        }
      }

      addMember(app.db, room.id, req.currentUser!.id)
      return toRoomSummary(findRoomSummary(app.db, room.id)!)
    },
  )
```

- [ ] **Step 5: Запустить все тесты и убедиться, что они проходят**

Run: `pnpm --filter server test`
Expected: PASS — все тесты, включая 4 новых

- [ ] **Step 6: Коммит**

```bash
git add server/src server/package.json server/test/rooms-ratelimit.test.ts server/test/rooms-leave-midgame.test.ts
git commit -m "Ограничить частоту попыток входа в комнату по паролю"
```

---

## Проверка результата плана

После Task 14 бэкенд закрывает игровой сценарий целиком. Ручная проверка:

```bash
pnpm --filter server dev &
TOKEN=$(curl -s localhost:3000/api/auth/guest -H 'content-type: application/json' \
  -d '{"nickname":"Аня"}' | sed -E 's/.*"token":"([^"]+)".*/\1/')
curl -s localhost:3000/api/rooms -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"name":"Проба"}'
```

Ожидается JSON комнаты с шестизначным кодом и `memberCount: 1`.

## Что дальше

- **План 2 — realtime:** журнал `room_events`, SSE с догрузкой по `Last-Event-ID`, presence, автопередача хоста, пометка брошенных игр.
- **План 3 — клиент:** маршрутизация, лобби, экран комнаты на событиях, переработка существующих компонентов.
- **План 4 — история и выпуск:** запросы истории и статистики, PWA, `Dockerfile`, раздача статики, деплой в Coolify.

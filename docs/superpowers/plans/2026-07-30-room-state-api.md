# План 1b. Каноническое состояние комнаты

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Сделать API пригодным для написания клиента: отдавать ники, состав комнаты и хоста, восстанавливать состояние после перезагрузки страницы и возвращать одну и ту же форму ответа отовсюду.

**Architecture:** Вводится единая структура `RoomState` — комната, её участники и последняя игра со счётом и журналом. Её собирает одна функция `buildRoomState`, и её возвращают все изменяющие маршруты. Комната адресуется своим кодом, а не uuid, поэтому клиент имеет дело с одним идентификатором.

**Tech Stack:** тот же — Node 22, Fastify 5, better-sqlite3, Vitest.

**Спека:** `docs/superpowers/specs/2026-07-30-multiplayer-score-counter-design.md`
**Предыдущий план:** `docs/superpowers/plans/2026-07-30-server-foundation.md`

---

## Зачем этот план

Проверка API глазами клиента нашла семь дыр. Четыре не дают написать клиент вообще:

| Проблема | Следствие |
|---|---|
| Ники не отдаются ни одним эндпоинтом | Табло «Борис: 12» нарисовать не из чего |
| Нет способа получить состав комнаты | Экран ожидания перед «Стартом» построить нечем |
| `hostUserId` нигде не виден | Клиент не знает, показывать ли кнопку «Старт» |
| По токену не найти свою комнату | После обновления страницы человека выбрасывает в лобби |

И три помельче: вход по ссылке требует двух запросов; родственные операции возвращают три разные формы; ошибки валидации и доменные ошибки выглядят по-разному.

Причина — промах спеки: в разделе про протокол сказано «клиент загружает полное состояние комнаты при входе», но эндпоинта, который это состояние отдаёт, в списке API нет.

**Почему до realtime, а не после.** В плане 2 события SSE понесут те же данные. Определив их поверх модели без ников и состава, мы запечём дыру ещё и в протокол событий. Наоборот, `RoomState` там пригодится дважды: как снимок, который SSE отдаёт при подключении, и как основа для дельт.

---

## Решения

**Комната адресуется кодом.** Сейчас у комнаты два идентификатора: `id` для API и `code` для ссылки-приглашения, и клиенту приходится их сопоставлять лишним запросом. Код уникален и стабилен, поэтому он и становится публичным адресом: `/api/rooms/JKSHV8/join`. Внутренний uuid остаётся в базе. Игры и записи по-прежнему адресуются своими uuid — клиент получает их из `RoomState` и никогда не составляет вручную.

**Два уровня видимости.** `GET /api/rooms/:code` отдаёт краткую сводку любому авторизованному: имя, нужен ли пароль, сколько людей. Этого хватает, чтобы показать «комната „Преферанс“, введите пароль» по ссылке. Полное состояние `GET /api/rooms/:code/state` доступно только участникам.

**Какая игра попадает в состояние.** Последняя начатая, независимо от статуса. Так экран победы переживает перезагрузку страницы, а после рестарта состояние показывает уже новую игру.

---

## Карта изменений

| Файл | Что происходит |
|---|---|
| `shared/src/index.ts` | Типы `RoomInfo`, `GameDetails`, `RoomState`; в `RoomSummary` добавляется `hostUserId` |
| `server/src/state/roomState.ts` | Создаётся: сборка `RoomState` из базы |
| `server/src/plugins/errors.ts` | Создаётся: единая форма ошибок |
| `server/src/repo/rooms.ts` | `listMembers` возвращает пользователей; поиск по коду |
| `server/src/repo/games.ts` | `findLatestGame`, `listGamePlayers` |
| `server/src/routes/rooms.ts` | Маршруты переходят на `:code`, возвращают `RoomState` |
| `server/src/routes/games.ts` | Старт возвращает `RoomState` |
| `server/src/routes/entries.ts` | Запись и отмена возвращают `RoomState` |
| `server/src/routes/auth.ts` | `GET /me` отдаёт `activeRoomCode` |

---

## Task 1: Единая форма ошибок

**Files:**
- Create: `server/src/plugins/errors.ts`
- Modify: `server/src/app.ts`
- Test: `server/test/errors.test.ts`

Контракт: у любого ответа с кодом 4xx/5xx есть поле `error` со строковым кодом и необязательное `message` для человека.

- [ ] **Step 1: Написать падающий тест**

`server/test/errors.test.ts`:

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

describe('форма ошибок', () => {
  it('у ошибки валидации есть error и message', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/rooms',
      headers: bearer(anya),
      payload: { name: '' },
    })

    expect(res.statusCode).toBe(400)
    expect(res.json()).toEqual({
      error: 'validation_failed',
      message: expect.any(String),
    })
  })

  it('у доменной ошибки есть error', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/me' })

    expect(res.statusCode).toBe(401)
    expect(res.json().error).toBe('unauthorized')
  })

  it('у ненайденного маршрута есть error', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/такого-нет' })

    expect(res.statusCode).toBe(404)
    expect(res.json().error).toBe('not_found')
  })

  it('не протекает внутренностями наружу при сбое', async () => {
    ctx.app.get('/api/взорвись', async () => {
      throw new Error('пароль от базы: секрет')
    })
    await ctx.app.ready()

    const res = await ctx.app.inject({ method: 'GET', url: '/api/взорвись' })

    expect(res.statusCode).toBe(500)
    expect(res.json()).toEqual({ error: 'internal_error', message: expect.any(String) })
    expect(res.body).not.toContain('пароль от базы')
  })
})
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `pnpm --filter server test errors`
Expected: FAIL — форма ответа `{statusCode, code, error, message}`

- [ ] **Step 3: Написать плагин**

`server/src/plugins/errors.ts`:

```ts
import fp from 'fastify-plugin'

/**
 * Приводит все ошибки к виду { error, message }.
 * Клиент разбирает один формат, а не два: свой и фастифаевский.
 */
export default fp(async (app) => {
  app.setNotFoundHandler(async (_req, reply) => {
    await reply.code(404).send({ error: 'not_found', message: 'маршрут не найден' })
  })

  app.setErrorHandler(async (err, req, reply) => {
    const status = err.statusCode ?? 500

    if (status >= 500) {
      // Наружу уходит только общее сообщение: детали сбоя — не дело клиента.
      req.log.error(err)
      return reply.code(500).send({
        error: 'internal_error',
        message: 'внутренняя ошибка сервера',
      })
    }

    const error = err.code === 'FST_ERR_VALIDATION' ? 'validation_failed' : (err.code ?? 'bad_request')
    return reply.code(status).send({ error, message: err.message })
  })
})
```

- [ ] **Step 4: Подключить плагин и причесать ответ ограничителя**

`server/src/app.ts` — добавить импорт:

```ts
import errorsPlugin from './plugins/errors.js'
```

заменить регистрацию ограничителя:

```ts
  app.register(rateLimit, {
    global: false,
    errorResponseBuilder: () => ({
      error: 'too_many_attempts',
      message: 'слишком много попыток, попробуйте позже',
    }),
  })
```

и зарегистрировать плагин ошибок сразу после неё:

```ts
  app.register(errorsPlugin)
```

- [ ] **Step 5: Запустить тесты и убедиться, что они проходят**

Run: `pnpm --filter server test`
Expected: PASS — все тесты, включая 4 новых

- [ ] **Step 6: Коммит**

```bash
git add server/src server/test/errors.test.ts
git commit -m "Привести ошибки к единой форме error и message"
```

---

## Task 2: Типы состояния и его сборка

**Files:**
- Modify: `shared/src/index.ts`, `server/src/repo/rooms.ts`, `server/src/repo/games.ts`
- Create: `server/src/state/roomState.ts`
- Test: `server/test/room-state.test.ts`

- [ ] **Step 1: Добавить типы в общий пакет**

`shared/src/index.ts` — дописать в конец:

```ts
export type RoomInfo = {
  id: string
  code: string
  name: string
  hasPassword: boolean
  hostUserId: string
}

export type GameDetails = {
  id: string
  scoreLimit: number
  status: GameStatus
  startedAt: number
  finishedAt: number | null
  winnerUserId: string | null
  players: PublicUser[]
  entries: ScoreEntry[]
  scores: Record<string, number>
}

/** То, что нужно для отрисовки экрана комнаты целиком. */
export type RoomState = {
  room: RoomInfo
  members: PublicUser[]
  game: GameDetails | null
}
```

и добавить `hostUserId: string` в тип `RoomSummary`.

`server/src/repo/rooms.ts` — `toRoomSummary` должна отдавать новое поле, иначе лобби по-прежнему не скажет, кто хост:

```ts
export function toRoomSummary(row: RoomWithCounts): RoomSummary {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    hasPassword: row.password_hash !== null,
    hostUserId: row.host_user_id,
    memberCount: row.member_count,
    gameActive: row.active_games > 0,
  }
}
```

- [ ] **Step 2: Написать падающий тест**

`server/test/room-state.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import { makeApp, closeApp, type TestApp } from './helpers.js'
import { createGuest } from '../src/repo/users.js'
import { createRoom, addMember } from '../src/repo/rooms.js'
import { startGame } from '../src/repo/games.js'
import { insertEntry } from '../src/repo/entries.js'
import { buildRoomState } from '../src/state/roomState.js'

let ctx: TestApp

beforeEach(async () => {
  ctx = await makeApp()
})

afterEach(async () => {
  await closeApp(ctx)
})

function tableOfTwo() {
  const anya = createGuest(ctx.db, 'Аня')
  const boris = createGuest(ctx.db, 'Борис')
  const room = createRoom(ctx.db, 'Преферанс', null, anya.id)
  addMember(ctx.db, room.id, anya.id)
  addMember(ctx.db, room.id, boris.id)
  return { anya, boris, room }
}

describe('buildRoomState', () => {
  it('возвращает null для несуществующей комнаты', () => {
    expect(buildRoomState(ctx.db, 'нет-такой')).toBeNull()
  })

  it('отдаёт комнату с хостом и участниками по именам', () => {
    const { anya, boris, room } = tableOfTwo()

    const state = buildRoomState(ctx.db, room.id)!

    expect(state.room).toEqual({
      id: room.id,
      code: room.code,
      name: 'Преферанс',
      hasPassword: false,
      hostUserId: anya.id,
    })
    expect(state.members.map((m) => m.nickname).sort()).toEqual(['Аня', 'Борис'])
    expect(state.members.map((m) => m.id).sort()).toEqual([anya.id, boris.id].sort())
    expect(state.game).toBeNull()
  })

  it('не выдаёт хэш пароля наружу', () => {
    const anya = createGuest(ctx.db, 'Аня')
    const room = createRoom(ctx.db, 'Закрытая', '$argon2id$секрет', anya.id)
    addMember(ctx.db, room.id, anya.id)

    const state = buildRoomState(ctx.db, room.id)!

    expect(state.room.hasPassword).toBe(true)
    expect(JSON.stringify(state)).not.toContain('argon2')
  })

  it('не выдаёт ушедших участников', () => {
    const { boris, room } = tableOfTwo()
    ctx.db
      .prepare('UPDATE room_members SET left_at = ? WHERE room_id = ? AND user_id = ?')
      .run(Date.now(), room.id, boris.id)

    const state = buildRoomState(ctx.db, room.id)!

    expect(state.members.map((m) => m.nickname)).toEqual(['Аня'])
  })

  it('отдаёт игру с игроками, счётом и журналом', () => {
    const { anya, boris, room } = tableOfTwo()
    const game = startGame(ctx.db, room.id, 100, [anya.id, boris.id])
    insertEntry(ctx.db, {
      id: randomUUID(),
      gameId: game.id,
      userId: boris.id,
      points: 12,
      createdBy: boris.id,
    })

    const state = buildRoomState(ctx.db, room.id)!

    expect(state.game!.id).toBe(game.id)
    expect(state.game!.scoreLimit).toBe(100)
    expect(state.game!.players.map((p) => p.nickname)).toEqual(['Аня', 'Борис'])
    expect(state.game!.scores).toEqual({ [anya.id]: 0, [boris.id]: 12 })
    expect(state.game!.entries).toHaveLength(1)
  })

  it('оставляет ушедшего из комнаты в составе игры', () => {
    const { anya, boris, room } = tableOfTwo()
    startGame(ctx.db, room.id, 100, [anya.id, boris.id])
    ctx.db
      .prepare('UPDATE room_members SET left_at = ? WHERE room_id = ? AND user_id = ?')
      .run(Date.now(), room.id, boris.id)

    const state = buildRoomState(ctx.db, room.id)!

    expect(state.members.map((m) => m.nickname)).toEqual(['Аня'])
    expect(state.game!.players.map((p) => p.nickname)).toEqual(['Аня', 'Борис'])
  })

  it('показывает последнюю игру, а не первую', () => {
    const { anya, boris, room } = tableOfTwo()
    const first = startGame(ctx.db, room.id, 100, [anya.id, boris.id])
    ctx.db.prepare(`UPDATE games SET status = 'finished', started_at = 1000 WHERE id = ?`).run(first.id)
    const second = startGame(ctx.db, room.id, 50, [anya.id, boris.id])
    ctx.db.prepare('UPDATE games SET started_at = 2000 WHERE id = ?').run(second.id)

    const state = buildRoomState(ctx.db, room.id)!

    expect(state.game!.id).toBe(second.id)
  })

  it('сохраняет завершённую игру в состоянии, чтобы пережить перезагрузку', () => {
    const { anya, boris, room } = tableOfTwo()
    const game = startGame(ctx.db, room.id, 100, [anya.id, boris.id])
    ctx.db
      .prepare(`UPDATE games SET status = 'finished', winner_user_id = ? WHERE id = ?`)
      .run(boris.id, game.id)

    const state = buildRoomState(ctx.db, room.id)!

    expect(state.game!.status).toBe('finished')
    expect(state.game!.winnerUserId).toBe(boris.id)
  })
})
```

- [ ] **Step 3: Запустить тест и убедиться, что он падает**

Run: `pnpm --filter server test room-state`
Expected: FAIL — `Failed to resolve import "../src/state/roomState.js"`

- [ ] **Step 4: Дописать репозитории**

`server/src/repo/rooms.ts` — добавить импорт типа и функцию:

```ts
import type { UserRow } from './users.js'
```

```ts
/** Порядок тот же, что у listMemberIds: места за столом обязаны быть устойчивыми. */
export function listMembers(db: Db, roomId: string): UserRow[] {
  return db
    .prepare(
      `SELECT users.* FROM room_members
       JOIN users ON users.id = room_members.user_id
       WHERE room_members.room_id = ? AND room_members.left_at IS NULL
       ORDER BY room_members.joined_at, users.id`,
    )
    .all(roomId) as UserRow[]
}
```

`server/src/repo/games.ts` — добавить импорт и две функции:

```ts
import type { UserRow } from './users.js'
```

```ts
/** Последняя начатая игра комнаты в любом статусе: экран победы переживает перезагрузку. */
export function findLatestGame(db: Db, roomId: string): GameRow | null {
  return (
    (db
      .prepare('SELECT * FROM games WHERE room_id = ? ORDER BY started_at DESC, id DESC LIMIT 1')
      .get(roomId) as GameRow | undefined) ?? null
  )
}

export function listGamePlayers(db: Db, gameId: string): UserRow[] {
  return db
    .prepare(
      `SELECT users.* FROM game_players
       JOIN users ON users.id = game_players.user_id
       WHERE game_players.game_id = ?
       ORDER BY game_players.seat`,
    )
    .all(gameId) as UserRow[]
}
```

- [ ] **Step 5: Написать сборку состояния**

`server/src/state/roomState.ts`:

```ts
import type { RoomState, GameDetails } from '@score/shared'
import type { Db } from '../db/index.js'
import { scoreboard } from '../domain/score.js'
import { findRoomById, listMembers } from '../repo/rooms.js'
import { findLatestGame, listGamePlayers } from '../repo/games.js'
import { listEntries } from '../repo/entries.js'
import { toPublicUser } from '../repo/users.js'

/**
 * Единственный источник того, что видит клиент о комнате.
 * Всё, что меняет состояние, возвращает результат этой функции, поэтому
 * стор на клиенте разбирает одну форму, а не по одной на каждый маршрут.
 */
export function buildRoomState(db: Db, roomId: string): RoomState | null {
  const room = findRoomById(db, roomId)
  if (!room) return null

  const game = findLatestGame(db, room.id)

  return {
    room: {
      id: room.id,
      code: room.code,
      name: room.name,
      hasPassword: room.password_hash !== null,
      hostUserId: room.host_user_id,
    },
    members: listMembers(db, room.id).map(toPublicUser),
    game: game === null ? null : buildGameDetails(db, game.id),
  }
}

function buildGameDetails(db: Db, game: GameRow): GameDetails {
  const players = listGamePlayers(db, game.id).map(toPublicUser)
  const entries = listEntries(db, game.id)

  return {
    id: game.id,
    scoreLimit: game.score_limit,
    status: game.status,
    startedAt: game.started_at,
    finishedAt: game.finished_at,
    winnerUserId: game.winner_user_id,
    players,
    entries,
    scores: scoreboard(
      entries,
      players.map((player) => player.id),
    ),
  }
}
```

Строку игры `buildRoomState` уже получила от `findLatestGame`, поэтому передаём её дальше, а не читаем повторно:

```ts
    game: game === null ? null : buildGameDetails(db, game),
```

Импорт из репозитория игр: `import { findLatestGame, listGamePlayers, type GameRow } from '../repo/games.js'`.

- [ ] **Step 6: Запустить тест и убедиться, что он проходит**

Run: `pnpm --filter server test room-state`
Expected: PASS, 8 тестов

- [ ] **Step 7: Коммит**

```bash
git add shared/src server/src server/test/room-state.test.ts
git commit -m "Добавить сборку состояния комнаты с никами и составом"
```

---

## Task 3: Перевести комнату на адресацию кодом

**Files:**
- Modify: `server/src/routes/rooms.ts`, `server/src/routes/games.ts`
- Modify: все тесты, обращающиеся к `/rooms/:id/...`
- Test: `server/test/rooms-by-code.test.ts`

- [ ] **Step 1: Написать падающий тест**

`server/test/rooms-by-code.test.ts`:

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

async function makeRoom(token: string, payload: { name: string; password?: string }) {
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/api/rooms',
    headers: { authorization: `Bearer ${token}` },
    payload,
  })
  return res.json()
}

describe('вход по коду одним запросом', () => {
  it('пускает в комнату по коду и паролю сразу', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')
    const boris = await createGuestSession(ctx.app, 'Борис')
    const room = await makeRoom(anya.token, { name: 'Закрытая', password: 'секрет' })

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${room.code}/join`,
      headers: bearer(boris),
      payload: { password: 'секрет' },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().members.map((m: { nickname: string }) => m.nickname).sort()).toEqual([
      'Аня',
      'Борис',
    ])
  })

  it('принимает код в нижнем регистре', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')
    const boris = await createGuestSession(ctx.app, 'Борис')
    const room = await makeRoom(anya.token, { name: 'Открытая' })

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${room.code.toLowerCase()}/join`,
      headers: bearer(boris),
      payload: {},
    })

    expect(res.statusCode).toBe(200)
  })

  it('отдаёт сводку по коду любому авторизованному до входа', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')
    const boris = await createGuestSession(ctx.app, 'Борис')
    const room = await makeRoom(anya.token, { name: 'Закрытая', password: 'секрет' })

    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/rooms/${room.code}`,
      headers: bearer(boris),
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({
      id: expect.any(String),
      code: room.code,
      name: 'Закрытая',
      hasPassword: true,
      hostUserId: anya.user.id,
      memberCount: 1,
      gameActive: false,
    })
  })

  it('не отдаёт полное состояние не участнику', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')
    const chuzhoj = await createGuestSession(ctx.app, 'Посторонний')
    const room = await makeRoom(anya.token, { name: 'Открытая' })

    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/rooms/${room.code}/state`,
      headers: bearer(chuzhoj),
    })

    expect(res.statusCode).toBe(403)
  })

  it('отдаёт полное состояние участнику', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')
    const room = await makeRoom(anya.token, { name: 'Открытая' })

    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/rooms/${room.code}/state`,
      headers: bearer(anya),
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().room.hostUserId).toBe(anya.user.id)
    expect(res.json().members).toHaveLength(1)
    expect(res.json().game).toBeNull()
  })

  it('отвечает 404 на неизвестный код', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/rooms/ZZZZZZ/join',
      headers: bearer(anya),
      payload: {},
    })

    expect(res.statusCode).toBe(404)
  })
})
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `pnpm --filter server test rooms-by-code`
Expected: FAIL — маршрутов с `:code` нет

- [ ] **Step 3: Переписать маршруты комнат**

`server/src/routes/rooms.ts` — полное содержимое файла:

```ts
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { RoomSummary } from '@score/shared'
import { hashPassword, verifyPassword } from '../auth/passwords.js'
import {
  createRoom,
  addMember,
  removeMember,
  listOpenRooms,
  findRoomByCode,
  findRoomSummary,
  toRoomSummary,
  isMember,
  type RoomRow,
} from '../repo/rooms.js'
import { buildRoomState } from '../state/roomState.js'

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

const joinSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    properties: {
      password: { type: 'string', maxLength: 100 },
    },
  },
}

/** Код приходит из ссылки, которую диктовали голосом, — регистр не важен. */
function requireOpenRoom(
  app: FastifyInstance,
  code: string,
  reply: FastifyReply,
): RoomRow | null {
  const room = findRoomByCode(app.db, code.toUpperCase())
  if (!room || room.closed_at !== null) {
    reply.code(404).send({ error: 'room_not_found' })
    return null
  }
  return room
}

function summaryOf(app: FastifyInstance, roomId: string): RoomSummary {
  return toRoomSummary(findRoomSummary(app.db, roomId)!)
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

      return buildRoomState(app.db, room.id)!
    },
  )

  app.get('/rooms', { preHandler: app.requireAuth }, async () => {
    return listOpenRooms(app.db).map(toRoomSummary)
  })

  app.get<{ Params: { code: string } }>(
    '/rooms/:code',
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const room = requireOpenRoom(app, req.params.code, reply)
      if (!room) return reply
      return summaryOf(app, room.id)
    },
  )

  app.get<{ Params: { code: string } }>(
    '/rooms/:code/state',
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const room = requireOpenRoom(app, req.params.code, reply)
      if (!room) return reply
      if (!isMember(app.db, room.id, req.currentUser!.id)) {
        return reply.code(403).send({ error: 'not_a_member' })
      }
      return buildRoomState(app.db, room.id)!
    },
  )

  app.post<{ Params: { code: string }; Body: { password?: string } }>(
    '/rooms/:code/join',
    {
      schema: joinSchema,
      preHandler: app.requireAuth,
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '5 minutes',
          // Ключ по паре «клиент + комната»: подбор пароля к одной комнате
          // не должен закрывать вход в остальные.
          keyGenerator: (req: FastifyRequest) =>
            `${req.ip}:${(req.params as { code: string }).code.toUpperCase()}`,
        },
      },
    },
    async (req, reply) => {
      const room = requireOpenRoom(app, req.params.code, reply)
      if (!room) return reply

      if (room.password_hash !== null) {
        const password = req.body.password ?? ''
        if (!(await verifyPassword(room.password_hash, password))) {
          return reply.code(403).send({ error: 'wrong_password' })
        }
      }

      addMember(app.db, room.id, req.currentUser!.id)
      return buildRoomState(app.db, room.id)!
    },
  )

  app.post<{ Params: { code: string } }>(
    '/rooms/:code/leave',
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const room = requireOpenRoom(app, req.params.code, reply)
      if (!room) return reply

      removeMember(app.db, room.id, req.currentUser!.id)
      return buildRoomState(app.db, room.id)!
    },
  )
}
```

- [ ] **Step 4: Перевести старт игры на код**

`server/src/routes/games.ts` — заменить импорт `findRoomById` на `findRoomByCode` в списке импортов из `../repo/rooms.js` и целиком заменить обработчик старта:

```ts
  app.post<{ Params: { code: string }; Body: { scoreLimit: number } }>(
    '/rooms/:code/games',
    { schema: startSchema, preHandler: app.requireAuth },
    async (req, reply) => {
      const room = findRoomByCode(app.db, req.params.code.toUpperCase())
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

      startGame(app.db, room.id, req.body.scoreLimit, playerIds)
      return buildRoomState(app.db, room.id)!
    },
  )
```

Возврат `RoomState` здесь уже учтён, поэтому Task 4 этот обработчик не трогает.

- [ ] **Step 5: Обновить обращения в существующих тестах**

Во всех тестах заменить обращения вида `/api/rooms/${roomId}/join`, `/leave`, `/games` на обращения по коду. Файлы: `rooms-join.test.ts`, `rooms-ratelimit.test.ts`, `rooms-leave-midgame.test.ts`, `games.test.ts`, `entries.test.ts`, `entries-void.test.ts`, `victory-flow.test.ts`, `empty-body.test.ts`.

Приём один и тот же: из ответа `POST /api/rooms` брать `.room.code` вместо `.id`.

- [ ] **Step 6: Запустить все тесты и убедиться, что они проходят**

Run: `pnpm --filter server test`
Expected: PASS

- [ ] **Step 7: Коммит**

```bash
git add server
git commit -m "Адресовать комнату кодом вместо uuid"
```

---

## Task 4: Игровые маршруты возвращают состояние комнаты

**Files:**
- Modify: `server/src/routes/games.ts`, `server/src/routes/entries.ts`
- Test: `server/test/state-responses.test.ts`

- [ ] **Step 1: Написать падающий тест**

`server/test/state-responses.test.ts`:

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

/** Стор на клиенте должен разбирать одну форму, а не по одной на маршрут. */
function expectRoomState(body: any) {
  expect(Object.keys(body).sort()).toEqual(['game', 'members', 'room'])
  expect(body.room).toEqual(
    expect.objectContaining({ id: expect.any(String), code: expect.any(String) }),
  )
}

async function table() {
  const anya = await createGuestSession(ctx.app, 'Аня')
  const boris = await createGuestSession(ctx.app, 'Борис')
  const created = await ctx.app.inject({
    method: 'POST',
    url: '/api/rooms',
    headers: bearer(anya),
    payload: { name: 'Преферанс' },
  })
  const code = created.json().room.code
  await ctx.app.inject({
    method: 'POST',
    url: `/api/rooms/${code}/join`,
    headers: bearer(boris),
    payload: {},
  })
  return { anya, boris, code }
}

describe('все изменяющие маршруты возвращают состояние комнаты', () => {
  it('создание комнаты', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/rooms',
      headers: bearer(anya),
      payload: { name: 'Преферанс' },
    })

    expectRoomState(res.json())
  })

  it('вход в комнату', async () => {
    const { code, boris } = await table()

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${code}/join`,
      headers: bearer(boris),
      payload: {},
    })

    expectRoomState(res.json())
  })

  it('старт игры', async () => {
    const { code, anya } = await table()

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${code}/games`,
      headers: bearer(anya),
      payload: { scoreLimit: 100 },
    })

    expectRoomState(res.json())
    expect(res.json().game.players).toHaveLength(2)
  })

  it('запись очков', async () => {
    const { code, anya, boris } = await table()
    await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${code}/games`,
      headers: bearer(anya),
      payload: { scoreLimit: 100 },
    })
    const state = await ctx.app.inject({
      method: 'GET',
      url: `/api/rooms/${code}/state`,
      headers: bearer(anya),
    })

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/games/${state.json().game.id}/entries`,
      headers: bearer(boris),
      payload: { id: randomUUID(), userId: boris.user.id, points: 12 },
    })

    expectRoomState(res.json())
    expect(res.json().game.scores[boris.user.id]).toBe(12)
  })

  it('отмена записи', async () => {
    const { code, anya, boris } = await table()
    await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${code}/games`,
      headers: bearer(anya),
      payload: { scoreLimit: 100 },
    })
    const started = await ctx.app.inject({
      method: 'GET',
      url: `/api/rooms/${code}/state`,
      headers: bearer(anya),
    })
    const entryId = randomUUID()
    await ctx.app.inject({
      method: 'POST',
      url: `/api/games/${started.json().game.id}/entries`,
      headers: bearer(boris),
      payload: { id: entryId, userId: boris.user.id, points: 12 },
    })

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/entries/${entryId}/void`,
      headers: bearer(boris),
    })

    expectRoomState(res.json())
    expect(res.json().game.scores[boris.user.id]).toBe(0)
  })

  it('выход из комнаты', async () => {
    const { code, boris } = await table()

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${code}/leave`,
      headers: bearer(boris),
    })

    expectRoomState(res.json())
  })
})
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `pnpm --filter server test state-responses`
Expected: FAIL — маршруты возвращают старые формы

- [ ] **Step 3: Убедиться, что старт игры уже возвращает состояние**

Это сделано в Task 3. Маршрут `GET /api/games/:id` остаётся как есть — он понадобится в плане про историю, чтобы смотреть завершённые игры отдельно от комнаты.

- [ ] **Step 4: Заменить возвраты в маршрутах записи и отмены**

`server/src/routes/entries.ts` — в обработчике записи очков заменить возврат

```ts
      return {
        entry: result.entry,
        game: toGame(result.settled),
        scores: scoreboard(listEntries(app.db, game.id), playerIds),
      }
```

на

```ts
      return buildRoomState(app.db, game.room_id)!
```

и в обработчике отмены заменить

```ts
      return {
        game: toGame(settled),
        scores: scoreboard(listEntries(app.db, game.id), playerIds),
      }
```

на

```ts
      return buildRoomState(app.db, game.room_id)!
```

Добавить импорт `buildRoomState`. Переменные `result` и `settled` по-прежнему нужны — транзакция обязана оставаться на месте, меняется только форма ответа. Импорты `toGame` и `scoreboard` из этого файла убрать, если больше не используются.

- [ ] **Step 5: Обновить существующие тесты под новую форму**

В `entries.test.ts`, `entries-void.test.ts` и `victory-flow.test.ts` обращения `res.json().scores[...]` заменить на `res.json().game.scores[...]`, `res.json().game.status` — на то же самое (поле `game` теперь вложено в состояние), а `res.json().entry` — на поиск записи в `res.json().game.entries`.

- [ ] **Step 6: Запустить все тесты и убедиться, что они проходят**

Run: `pnpm --filter server test`
Expected: PASS

- [ ] **Step 7: Коммит**

```bash
git add server
git commit -m "Возвращать состояние комнаты из всех изменяющих маршрутов"
```

---

## Task 5: Восстановление после перезагрузки страницы

**Files:**
- Modify: `server/src/routes/auth.ts`, `server/src/repo/rooms.ts`, `shared/src/index.ts`
- Test: `server/test/session-restore.test.ts`

- [ ] **Step 1: Написать падающий тест**

`server/test/session-restore.test.ts`:

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

describe('GET /api/me', () => {
  it('не называет комнату тому, кто никуда не входил', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/me',
      headers: bearer(anya),
    })

    expect(res.json()).toEqual({
      id: anya.user.id,
      nickname: 'Аня',
      hasEmail: false,
      activeRoomCode: null,
    })
  })

  it('называет комнату, в которой человек состоит', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')
    const created = await ctx.app.inject({
      method: 'POST',
      url: '/api/rooms',
      headers: bearer(anya),
      payload: { name: 'Преферанс' },
    })

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/me',
      headers: bearer(anya),
    })

    expect(res.json().activeRoomCode).toBe(created.json().room.code)
  })

  it('забывает комнату после выхода', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')
    const created = await ctx.app.inject({
      method: 'POST',
      url: '/api/rooms',
      headers: bearer(anya),
      payload: { name: 'Преферанс' },
    })
    await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${created.json().room.code}/leave`,
      headers: bearer(anya),
    })

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/me',
      headers: bearer(anya),
    })

    expect(res.json().activeRoomCode).toBeNull()
  })

  it('называет последнюю комнату, если человек в нескольких', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')
    await ctx.app.inject({
      method: 'POST',
      url: '/api/rooms',
      headers: bearer(anya),
      payload: { name: 'Первая' },
    })
    const second = await ctx.app.inject({
      method: 'POST',
      url: '/api/rooms',
      headers: bearer(anya),
      payload: { name: 'Вторая' },
    })

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/me',
      headers: bearer(anya),
    })

    expect(res.json().activeRoomCode).toBe(second.json().room.code)
  })

  it('забывает закрытую комнату', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')
    const created = await ctx.app.inject({
      method: 'POST',
      url: '/api/rooms',
      headers: bearer(anya),
      payload: { name: 'Вчерашняя' },
    })
    ctx.db
      .prepare('UPDATE rooms SET closed_at = ? WHERE code = ?')
      .run(Date.now(), created.json().room.code)

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/me',
      headers: bearer(anya),
    })

    expect(res.json().activeRoomCode).toBeNull()
  })
})
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `pnpm --filter server test session-restore`
Expected: FAIL — поля `activeRoomCode` нет

- [ ] **Step 3: Расширить тип**

`shared/src/index.ts` — заменить тип `PublicUser` и добавить отдельный тип для себя:

```ts
export type PublicUser = {
  id: string
  nickname: string
  hasEmail: boolean
}

/** Себя видно подробнее: клиенту нужно, куда вернуться после перезагрузки. */
export type CurrentUser = PublicUser & {
  activeRoomCode: string | null
}
```

- [ ] **Step 4: Добавить запрос в репозиторий**

`server/src/repo/rooms.ts`:

```ts
/** Последняя открытая комната, в которой человек состоит, — куда вернуть его после F5. */
export function findActiveRoomCode(db: Db, userId: string): string | null {
  const row = db
    .prepare(
      `SELECT rooms.code FROM room_members
       JOIN rooms ON rooms.id = room_members.room_id
       WHERE room_members.user_id = ?
         AND room_members.left_at IS NULL
         AND rooms.closed_at IS NULL
       ORDER BY room_members.joined_at DESC, rooms.code DESC
       LIMIT 1`,
    )
    .get(userId) as { code: string } | undefined
  return row?.code ?? null
}
```

- [ ] **Step 5: Отдать поле из /me**

`server/src/routes/auth.ts` — добавить импорт `findActiveRoomCode` из `../repo/rooms.js` и заменить обработчик:

```ts
  app.get('/me', { preHandler: app.requireAuth }, async (req) => {
    const user = req.currentUser!
    return {
      ...toPublicUser(user),
      activeRoomCode: findActiveRoomCode(app.db, user.id),
    }
  })
```

- [ ] **Step 6: Обновить тест из плана 1**

В `server/test/auth.test.ts` тест «возвращает текущего пользователя по токену» сравнивает ответ с `guest.user`. Заменить сравнение на:

```ts
    expect(res.json()).toEqual({ ...guest.user, activeRoomCode: null })
```

- [ ] **Step 7: Запустить все тесты и убедиться, что они проходят**

Run: `pnpm --filter server test`
Expected: PASS

- [ ] **Step 8: Коммит**

```bash
git add shared server
git commit -m "Отдавать активную комнату в /me для восстановления после перезагрузки"
```

---

## Task 6: Сквозной тест сборки экранов

**Files:**
- Test: `server/test/screens.test.ts`

Тест, которого не хватало: он проверяет не отдельные ручки, а возможность отрисовать интерфейс. Именно его отсутствие пропустило все семь дыр.

- [ ] **Step 1: Написать тест**

`server/test/screens.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { RoomState } from '@score/shared'
import { makeApp, closeApp, createGuestSession, bearer, type TestApp } from './helpers.js'

let ctx: TestApp

beforeEach(async () => {
  ctx = await makeApp()
})

afterEach(async () => {
  await closeApp(ctx)
})

/** Как клиент отрисовал бы экран ожидания: состав и кнопка «Старт» только у хоста. */
function renderRoomScreen(state: RoomState, viewerId: string): string {
  const lines = [`Комната «${state.room.name}», код ${state.room.code}`]
  for (const member of state.members) {
    const marks = [
      member.id === state.room.hostUserId ? 'хост' : null,
      member.id === viewerId ? 'вы' : null,
    ].filter(Boolean)
    lines.push(`  ${member.nickname}${marks.length ? ` (${marks.join(', ')})` : ''}`)
  }
  if (state.room.hostUserId === viewerId && state.game === null) {
    lines.push('  [Старт]')
  }
  return lines.join('\n')
}

/** Как клиент отрисовал бы табло. */
function renderScoreboard(state: RoomState): string {
  const game = state.game!
  const lines = [`До ${game.scoreLimit} очков`]
  for (const player of game.players) {
    lines.push(`  ${player.nickname}: ${game.scores[player.id]}`)
  }
  if (game.winnerUserId !== null) {
    const winner = game.players.find((p) => p.id === game.winnerUserId)!
    lines.push(`  Победил ${winner.nickname}`)
  }
  return lines.join('\n')
}

describe('экраны собираются только из ответов API', () => {
  it('экран ожидания показывает имена, хоста и кнопку старта', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')
    const boris = await createGuestSession(ctx.app, 'Борис')
    const created = await ctx.app.inject({
      method: 'POST',
      url: '/api/rooms',
      headers: bearer(anya),
      payload: { name: 'Преферанс' },
    })
    const code = created.json().room.code
    const joined = await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${code}/join`,
      headers: bearer(boris),
      payload: {},
    })

    const forHost = renderRoomScreen(joined.json(), anya.user.id)
    const forGuest = renderRoomScreen(joined.json(), boris.user.id)

    expect(forHost).toContain('Аня (хост, вы)')
    expect(forHost).toContain('Борис')
    expect(forHost).toContain('[Старт]')
    expect(forGuest).toContain('Борис (вы)')
    expect(forGuest).not.toContain('[Старт]')
  })

  it('табло показывает имена и счёт, а не идентификаторы', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')
    const boris = await createGuestSession(ctx.app, 'Борис')
    const created = await ctx.app.inject({
      method: 'POST',
      url: '/api/rooms',
      headers: bearer(anya),
      payload: { name: 'Преферанс' },
    })
    const code = created.json().room.code
    await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${code}/join`,
      headers: bearer(boris),
      payload: {},
    })
    const started = await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${code}/games`,
      headers: bearer(anya),
      payload: { scoreLimit: 30 },
    })
    const afterEntry = await ctx.app.inject({
      method: 'POST',
      url: `/api/games/${started.json().game.id}/entries`,
      headers: bearer(boris),
      payload: { id: randomUUID(), userId: boris.user.id, points: 30 },
    })

    const board = renderScoreboard(afterEntry.json())

    expect(board).toContain('До 30 очков')
    expect(board).toContain('Аня: 0')
    expect(board).toContain('Борис: 30')
    expect(board).toContain('Победил Борис')
    expect(board).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/)
  })

  it('после перезагрузки страницы экран восстанавливается по одному токену', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')
    const boris = await createGuestSession(ctx.app, 'Борис')
    const created = await ctx.app.inject({
      method: 'POST',
      url: '/api/rooms',
      headers: bearer(anya),
      payload: { name: 'Преферанс' },
    })
    const code = created.json().room.code
    await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${code}/join`,
      headers: bearer(boris),
      payload: {},
    })
    await ctx.app.inject({
      method: 'POST',
      url: `/api/rooms/${code}/games`,
      headers: bearer(anya),
      payload: { scoreLimit: 30 },
    })

    // Всё, что осталось у браузера, — токен.
    const me = await ctx.app.inject({ method: 'GET', url: '/api/me', headers: bearer(boris) })
    const restored = await ctx.app.inject({
      method: 'GET',
      url: `/api/rooms/${me.json().activeRoomCode}/state`,
      headers: bearer(boris),
    })

    expect(renderScoreboard(restored.json())).toContain('Борис: 0')
    expect(renderRoomScreen(restored.json(), boris.user.id)).toContain('Аня (хост)')
  })

  it('ссылка-приглашение показывает комнату до входа одним запросом', async () => {
    const anya = await createGuestSession(ctx.app, 'Аня')
    const boris = await createGuestSession(ctx.app, 'Борис')
    const created = await ctx.app.inject({
      method: 'POST',
      url: '/api/rooms',
      headers: bearer(anya),
      payload: { name: 'Преферанс', password: 'секрет' },
    })
    const code = created.json().room.code

    const preview = await ctx.app.inject({
      method: 'GET',
      url: `/api/rooms/${code}`,
      headers: bearer(boris),
    })

    expect(preview.json().name).toBe('Преферанс')
    expect(preview.json().hasPassword).toBe(true)
  })
})
```

- [ ] **Step 2: Запустить тест и убедиться, что он проходит**

Run: `pnpm --filter server test screens`
Expected: PASS, 4 теста

Если тест падает — это дыра в API, а не в тесте: чинить надо сервер.

- [ ] **Step 3: Прогнать всё, проверить типы и сборку**

Run: `pnpm --filter server test && pnpm typecheck && pnpm --filter server build`
Expected: всё зелёное

- [ ] **Step 4: Коммит**

```bash
git add server
git commit -m "Добавить сквозной тест сборки экранов из ответов API"
```

---

## Проверка результата плана

После Task 6 клиент можно писать: у каждого ответа одна форма, ники есть, хост известен, состояние переживает перезагрузку.

## Что дальше

- **План 2 — realtime:** `RoomState` становится снимком, который SSE отдаёт при подключении, а события — дельтами к нему.
- **План 3 — клиент.**
- **План 4 — история, PWA, деплой.**

# План 4 — история и выпуск

История игр, статистика, PWA, один образ на всё, деплой.

## Решения

| Развилка | Решение | Почему |
|---|---|---|
| Доступ к прошлой игре | По составу игры, а не по членству в комнате | `GET /api/games/:id` сейчас требует быть участником комнаты. Ушедший из комнаты потерял бы доступ к собственной истории |
| Брошенные игры | В статистику не идут | Партия, которую не доиграли, не говорит ни о победах, ни о поражениях |
| Раздача статики | Тем же Fastify, SPA-fallback на `index.html` | Один домен, один деплой, нет CORS. Fallback нужен, чтобы прямая ссылка `/room/КОД` открывалась, а не давала 404 |
| Service worker | Кэширует только собранные ассеты | Данные всегда с сервера: закэшированный счёт хуже отсутствующего |
| Секреты | Их нет | Токен — случайные байты, в базе только SHA-256. Подписывать нечего, `SESSION_SECRET` не нужен |

## API

```
GET /api/me/games?limit=&before=   → GameHistoryItem[]
GET /api/me/stats                  → MyStats
GET /api/games/:id                 → детали игры (доступ по составу)
```

```ts
type GameHistoryItem = {
  id, roomName, roomCode, scoreLimit, status,
  startedAt, finishedAt, winnerUserId,
  myScore: number
  players: PublicUser[]
}

type MyStats = {
  gamesPlayed: number       // доигранные, без брошенных
  wins: number
  bestScore: number
  opponents: { user: PublicUser; games: number; theirWins: number }[]
}
```

## Шаги

1. Сервер: доступ к `GET /api/games/:id` по составу игры.
2. Сервер: `/api/me/games` и `/api/me/stats`.
3. Клиент: `/history` и `/history/:gameId`, ссылка из лобби.
4. PWA: манифест, иконки, регистрация service worker.
5. Раздача статики и SPA-fallback тем же Fastify.
6. `Dockerfile` и `.dockerignore`.
7. Проверка собранного образа локально: поднять контейнер, пройти сценарий.
8. Инструкция по деплою в Coolify. Сама выкатка — по отдельному согласию.

## Проверка

`pnpm --filter server test`, `pnpm --filter client test`, `pnpm typecheck`. Шаг 7 — образ целиком: том в `/data`, прямая ссылка на комнату, поток событий через контейнер.

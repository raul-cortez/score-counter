import { openDb } from './db/index.js'
import { buildApp } from './app.js'

const port = Number(process.env.PORT ?? 3000)
const dbPath = process.env.DB_PATH ?? './score.db'
// В образе сюда кладётся собранный клиент; локально переменной нет и сервер
// отдаёт только API, а фронт держит Vite.
const staticRoot = process.env.STATIC_ROOT

const db = openDb(dbPath)
const app = buildApp(db, { staticRoot })

async function shutdown(signal: string): Promise<void> {
  // Остановка закрывает открытые потоки событий и снимает таймеры передачи хоста;
  // без этого контейнер висел бы до тайм-аута оркестратора.
  console.log(`${signal}: останавливаемся`)
  await app.close()
  db.close()
  process.exit(0)
}

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => void shutdown(signal))
}

app.listen({ port, host: '0.0.0.0' }).catch((err) => {
  console.error(err)
  process.exit(1)
})

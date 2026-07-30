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

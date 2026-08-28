import Database from 'better-sqlite3'
import { SCHEMA_SQL } from './schema.js'

export type Db = Database.Database

/**
 * `CREATE TABLE IF NOT EXISTS` не добавляет колонку в уже существующую таблицу,
 * поэтому колонки, заведённые после первого релиза, нужно доводить руками.
 * На свежей базе `rooms` уже приходит с `creator_user_id` из SCHEMA_SQL, и шаг
 * молча ничего не делает.
 */
function migrate(db: Db): void {
  const columns = db.prepare('PRAGMA table_info(rooms)').all() as { name: string }[]
  if (columns.some((column) => column.name === 'creator_user_id')) return

  db.exec('ALTER TABLE rooms ADD COLUMN creator_user_id TEXT REFERENCES users(id)')
  // Кто фактически создал старые комнаты, база не помнит — берём текущего хоста
  // как разумное приближение, дальше это поле только для новых комнат.
  db.exec('UPDATE rooms SET creator_user_id = host_user_id WHERE creator_user_id IS NULL')
}

export function openDb(path: string): Db {
  const db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(SCHEMA_SQL)
  migrate(db)
  return db
}

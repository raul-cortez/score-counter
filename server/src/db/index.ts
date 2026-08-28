import Database from 'better-sqlite3'
import { SCHEMA_SQL } from './schema.js'

export type Db = Database.Database

/**
 * `CREATE TABLE IF NOT EXISTS` не добавляет колонку в уже существующую таблицу,
 * поэтому колонки, заведённые после первого релиза, нужно доводить руками.
 * На свежей базе `rooms` уже приходит с `creator_user_id` из SCHEMA_SQL, и шаг
 * молча ничего не делает.
 */
function hasColumn(db: Db, table: string, column: string): boolean {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  return columns.some((c) => c.name === column)
}

function migrate(db: Db): void {
  if (!hasColumn(db, 'rooms', 'creator_user_id')) {
    db.exec('ALTER TABLE rooms ADD COLUMN creator_user_id TEXT REFERENCES users(id)')
    // Кто фактически создал старые комнаты, база не помнит — берём текущего хоста
    // как разумное приближение, дальше это поле только для новых комнат.
    db.exec('UPDATE rooms SET creator_user_id = host_user_id WHERE creator_user_id IS NULL')
  }

  if (!hasColumn(db, 'game_players', 'removed_at')) {
    db.exec('ALTER TABLE game_players ADD COLUMN removed_at INTEGER')
  }
}

export function openDb(path: string): Db {
  const db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(SCHEMA_SQL)
  migrate(db)
  return db
}

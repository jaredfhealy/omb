import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'

const dataDir = path.resolve(process.cwd(), 'server', 'data')
const dbPath = path.join(dataDir, 'app.db')

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true })
}

const db = new Database(dbPath)

db.exec(`
  CREATE TABLE IF NOT EXISTS app_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`)

const columns = db.prepare("PRAGMA table_info('app_state')").all()
const hasPayloadColumn = columns.some((column) => column.name === 'payload')
const hasStateJsonColumn = columns.some((column) => column.name === 'state_json')

if (hasStateJsonColumn) {
  if (!hasPayloadColumn) {
    db.exec('ALTER TABLE app_state ADD COLUMN payload TEXT')
  }
  db.exec("UPDATE app_state SET payload = state_json WHERE payload IS NULL")
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_state_new (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)
  db.exec(`
    INSERT OR REPLACE INTO app_state_new (id, payload, updated_at)
    SELECT id, payload, updated_at
    FROM app_state
  `)
  db.exec('DROP TABLE app_state')
  db.exec('ALTER TABLE app_state_new RENAME TO app_state')
}

const initialState = {}
const existingRow = db.prepare('SELECT id FROM app_state WHERE id = 1').get()

if (!existingRow) {
  db.prepare(
    'INSERT INTO app_state (id, payload, updated_at) VALUES (1, ?, ?)'
  ).run(JSON.stringify(initialState), new Date().toISOString())
} else {
  db.exec("UPDATE app_state SET payload = '{}' WHERE id = 1 AND payload IS NULL")
}

export function getStateRecord() {
  return db.prepare('SELECT payload, updated_at FROM app_state WHERE id = 1').get()
}

export function updateState(state) {
  const payload = JSON.stringify(state)
  const updatedAt = new Date().toISOString()

  db.prepare('UPDATE app_state SET payload = ?, updated_at = ? WHERE id = 1').run(payload, updatedAt)

  return updatedAt
}

export { dbPath }

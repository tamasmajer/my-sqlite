import Database from 'better-sqlite3'

const dbs = new Map()

export function open(path) {
  if (dbs.has(path)) return dbs.get(path)
  const db = new Database(path)
  db.pragma('journal_mode = WAL')
  dbs.set(path, db)
  return db
}

export function run(db, sql, params = []) {
  return db.prepare(sql).run(...params)
}

export function get(db, sql, params = []) {
  return db.prepare(sql).get(...params)
}

export function all(db, sql, params = []) {
  return db.prepare(sql).all(...params)
}

export function transaction(db, fn) {
  return db.transaction(fn)()
}

export function tables(db) {
  return db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r => r.name)
}

export function columns(db, table) {
  return db.prepare(`PRAGMA table_info("${table}")`).all()
}

export function indexes(db, table) {
  return db.prepare(`PRAGMA index_list("${table}")`).all()
}

export function indexColumns(db, indexName) {
  return db.prepare(`PRAGMA index_info("${indexName}")`).all().map(r => r.name)
}

export function close(db) {
  db.close()
  for (const [path, d] of dbs) {
    if (d === db) { dbs.delete(path); break }
  }
}

export function closeAll() {
  for (const [path, db] of dbs) {
    db.close()
  }
  dbs.clear()
}

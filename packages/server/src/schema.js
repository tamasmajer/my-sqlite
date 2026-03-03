import * as Sql from './access/sqlite.js'
import * as Fs from './access/fs.js'
import { join } from 'node:path'

export function openDb(datadir, name) {
  Fs.ensureDir(datadir)
  const path = join(datadir, name + '.sqlite')
  return Sql.open(path)
}

export function listCollections(db) {
  const names = Sql.tables(db).filter(n => n !== '_meta')
  const result = {}
  for (const name of names) {
    result[name] = getMeta(db, name)
  }
  return result
}

// --- Meta ---

export function getMeta(db, collection) {
  const cols = Sql.columns(db, collection).map(c => c.name)
  const idxList = Sql.indexes(db, collection)
  const indexed = []
  for (const idx of idxList) {
    if (!idx.name.startsWith('idx_')) continue
    const idxCols = Sql.indexColumns(db, idx.name)
    indexed.push(...idxCols)
  }
  const key = getKeyFields(db, collection)
  return { columns: cols, index: indexed, key }
}

export function setMeta(db, collection, meta) {
  if (meta.index) {
    const tables = Sql.tables(db)
    if (tables.includes(collection)) {
      setIndexes(db, collection, meta.index)
    }
  }
  if (meta.key) {
    // Key can only be set before data exists or by recreating the table
    // For now, store in _meta table for reference
    ensureMetaTable(db)
    const keyVal = Array.isArray(meta.key) ? meta.key.join(',') : meta.key
    const existing = Sql.get(db, `SELECT * FROM _meta WHERE collection = ?`, [collection])
    if (existing) {
      Sql.run(db, `UPDATE _meta SET key_fields = ? WHERE collection = ?`, [keyVal, collection])
    } else {
      Sql.run(db, `INSERT INTO _meta (collection, key_fields) VALUES (?, ?)`, [collection, keyVal])
    }
  }
}

function ensureMetaTable(db) {
  Sql.run(db, `CREATE TABLE IF NOT EXISTS _meta (collection TEXT PRIMARY KEY, key_fields TEXT)`)
}

function getKeyFields(db, collection) {
  const tables = Sql.tables(db)
  if (tables.includes('_meta')) {
    const row = Sql.get(db, `SELECT key_fields FROM _meta WHERE collection = ?`, [collection])
    if (row && row.key_fields) {
      const fields = row.key_fields.split(',')
      return fields.length === 1 ? fields[0] : fields
    }
  }
  return 'id'
}

// Returns key fields as an array (always)
export function getKeyFieldsArray(db, collection) {
  const key = getKeyFields(db, collection)
  return Array.isArray(key) ? key : [key]
}

// --- Table management ---

export function ensureTable(db, collection, row) {
  const existing = Sql.tables(db)
  if (existing.includes(collection)) {
    ensureColumns(db, collection, row)
    return
  }
  const keyFields = getKeyFieldsArray(db, collection)
  const keys = Object.keys(row)
  const colDefs = keys.map(k => {
    if (keyFields.includes(k)) return null // handled in PK constraint
    return `"${k}" ${inferType(row[k])}`
  }).filter(Boolean)

  const keyColDefs = keyFields.map(k => `"${k}" ${inferType(row[k] !== undefined ? row[k] : '')}`)
  const allCols = [...keyColDefs, ...colDefs]
  const pkClause = keyFields.map(k => `"${k}"`).join(', ')

  const sql = `CREATE TABLE "${collection}" (${allCols.join(', ')}, PRIMARY KEY (${pkClause}))`
  Sql.run(db, sql)
}

export function ensureColumns(db, collection, row) {
  const existing = Sql.columns(db, collection).map(c => c.name)
  const keys = Object.keys(row)
  for (const k of keys) {
    if (!existing.includes(k)) {
      Sql.run(db, `ALTER TABLE "${collection}" ADD COLUMN "${k}" ${inferType(row[k])}`)
    }
  }
}

export function setIndexes(db, collection, indexedFields) {
  const idxList = Sql.indexes(db, collection)
  for (const idx of idxList) {
    if (idx.name.startsWith('idx_')) {
      Sql.run(db, `DROP INDEX "${idx.name}"`)
    }
  }
  for (const field of indexedFields) {
    Sql.run(db, `CREATE INDEX "idx_${collection}_${field}" ON "${collection}"("${field}")`)
  }
}

export function dropCollection(db, collection) {
  Sql.run(db, `DROP TABLE IF EXISTS "${collection}"`)
  // Clean up _meta entry
  const tables = Sql.tables(db)
  if (tables.includes('_meta')) {
    Sql.run(db, `DELETE FROM _meta WHERE collection = ?`, [collection])
  }
}

export function dropDb(datadir, name) {
  const base = join(datadir, name + '.sqlite')
  // Close cached connection if open
  const db = Sql.open(base)
  Sql.close(db)
  Fs.remove(base)
  Fs.remove(base + '-wal')
  Fs.remove(base + '-shm')
}

export function isDbEmpty(db) {
  const tables = Sql.tables(db).filter(n => n !== '_meta')
  return tables.length === 0
}

export function jsonColumns(db, collection) {
  return Sql.columns(db, collection).filter(c => c.type === 'JSON').map(c => c.name)
}

function inferType(value) {
  if (typeof value === 'number') return Number.isInteger(value) ? 'INTEGER' : 'REAL'
  if (typeof value === 'boolean') return 'INTEGER'
  if (Array.isArray(value) || (typeof value === 'object' && value !== null)) return 'JSON'
  return 'TEXT'
}
